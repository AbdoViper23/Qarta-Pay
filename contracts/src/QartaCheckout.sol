// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice The part of a Chainlink-style price feed that the oracle guard reads.
interface IAggregatorV3 {
    function decimals() external view returns (uint8);

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

/// @title QartaCheckout
/// @notice Escrow for Qarta Pay orders on QIE.
///
/// A buyer pays in QUSDC or native QIE against a price ("quote") signed by the backend.
/// The contract holds the payment per order until one of three things happens:
///   - `settle`:      the fulfiller confirms delivery, funds go to the treasury
///   - `refund`:      the fulfiller reports a failed delivery, funds go back to the payer
///   - `claimRefund`: nobody acted before `refundTimeout`, the payer takes the funds back
///
/// Trust model: the fulfiller can only move an order's funds to the treasury or back to the
/// payer. The quote signer can only authorise a price. The owner configures the contract and
/// can pause new payments, but can never touch escrowed funds and can never block refunds.
contract QartaCheckout is Ownable2Step, Pausable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    // ------------------------------------------------------------------ types

    enum Status {
        None,
        Paid,
        Settled,
        Refunded
    }

    /// @notice Price offer signed off-chain by `quoteSigner` (EIP-712).
    struct Quote {
        bytes32 orderId; // unique id chosen by the backend
        address payer; // must be msg.sender
        address token; // address(0) = native QIE, otherwise an allowed ERC-20
        uint256 amount; // token base units (QUSDC: 6 decimals, QIE: 18)
        uint256 usdAmount; // 6 decimals; used by the oracle guard and in events
        uint64 expiry; // unix seconds; the quote cannot be paid after this
    }

    struct Escrow {
        address payer;
        address token;
        uint256 amount;
        uint64 paidAt;
        Status status;
    }

    // -------------------------------------------------------------- constants

    bytes32 public constant QUOTE_TYPEHASH = keccak256(
        "Quote(bytes32 orderId,address payer,address token,uint256 amount,uint256 usdAmount,uint64 expiry)"
    );

    address public constant NATIVE = address(0);
    uint256 private constant BPS = 10_000;
    /// @dev Native QIE has 18 decimals and USD amounts have 6.
    uint256 private constant QIE_TO_USD6_DIVISOR = 1e12;

    uint64 public constant MIN_REFUND_TIMEOUT = 30 minutes;
    uint64 public constant MAX_REFUND_TIMEOUT = 7 days;
    uint16 public constant MAX_ORACLE_TOLERANCE_BPS = 5_000;

    // ---------------------------------------------------------------- storage

    /// @notice Seconds after payment before the payer may call `claimRefund`. Fixed at deployment:
    ///         the backend's fulfilment cutoff is derived from it, so it must not change under live orders.
    uint64 public immutable refundTimeout;

    mapping(bytes32 orderId => Escrow) public orders;
    mapping(address token => bool) public allowedToken;
    /// @notice Sum of all orders in `Paid` status, per token (`address(0)` = native QIE).
    mapping(address token => uint256) public totalEscrowed;

    address public quoteSigner;
    address public fulfiller;
    address public treasury;

    address public oracle;
    uint8 public oracleDecimals;
    uint32 public maxOracleAge;
    uint16 public oracleToleranceBps;
    bool public oracleGuardEnabled;

    // ----------------------------------------------------------------- events

    event OrderPaid(
        bytes32 indexed orderId, address indexed payer, address indexed token, uint256 amount, uint256 usdAmount
    );
    event OrderSettled(bytes32 indexed orderId);
    event OrderRefunded(bytes32 indexed orderId, address indexed to, uint256 amount, bool byPayer);

    event QuoteSignerChanged(address indexed quoteSigner);
    event FulfillerChanged(address indexed fulfiller);
    event TreasuryChanged(address indexed treasury);
    event AllowedTokenChanged(address indexed token, bool allowed);
    event OracleChanged(address indexed oracle, uint8 decimals);
    event OracleParamsChanged(uint32 maxOracleAge, uint16 oracleToleranceBps);
    event OracleGuardToggled(bool enabled);
    event Rescued(address indexed token, address indexed to, uint256 amount);

    // ----------------------------------------------------------------- errors

    error ZeroAddress();
    error ZeroAmount();
    error InvalidRefundTimeout();
    error InvalidTolerance();
    error QuoteExpired();
    error WrongPayer();
    error OrderAlreadyExists();
    error InvalidSignature();
    error TokenNotAllowed();
    error WrongValue();
    error WrongAmountReceived();
    error NotFulfiller();
    error NotPayer();
    error OrderNotPaid();
    error RefundTimeoutNotReached();
    error TransferFailed();
    error OracleNotSet();
    error OracleStale();
    error OracleBadAnswer();
    error PriceBelowOracle();
    error ExceedsRescuable();
    error RenounceDisabled();

    // -------------------------------------------------------------- modifiers

    modifier onlyFulfiller() {
        if (msg.sender != fulfiller) revert NotFulfiller();
        _;
    }

    // ------------------------------------------------------------ constructor

    /// @param initialOwner        deployer; hands ownership to the cold wallet with `transferOwnership`
    /// @param quoteSigner_        backend key that signs quotes
    /// @param fulfiller_          backend key that settles and refunds
    /// @param treasury_           receives settled funds
    /// @param stablecoin          ERC-20 accepted for payment (QUSDC)
    /// @param oracle_             QIE/USD price feed; may be zero only if the guard starts disabled
    /// @param maxOracleAge_       oldest feed answer the guard accepts, in seconds
    /// @param oracleToleranceBps_ how far below the feed price a native payment may be
    /// @param oracleGuardEnabled_ whether native payments are checked against the feed
    /// @param refundTimeout_      seconds before a payer may self-refund
    constructor(
        address initialOwner,
        address quoteSigner_,
        address fulfiller_,
        address treasury_,
        address stablecoin,
        address oracle_,
        uint32 maxOracleAge_,
        uint16 oracleToleranceBps_,
        bool oracleGuardEnabled_,
        uint64 refundTimeout_
    ) Ownable(initialOwner) EIP712("QartaCheckout", "1") {
        if (refundTimeout_ < MIN_REFUND_TIMEOUT || refundTimeout_ > MAX_REFUND_TIMEOUT) {
            revert InvalidRefundTimeout();
        }
        refundTimeout = refundTimeout_;

        _setQuoteSigner(quoteSigner_);
        _setFulfiller(fulfiller_);
        _setTreasury(treasury_);
        _setAllowedToken(stablecoin, true);
        if (oracle_ != address(0)) _setOracle(oracle_);
        _setOracleParams(maxOracleAge_, oracleToleranceBps_);
        _setOracleGuardEnabled(oracleGuardEnabled_);
    }

    // ---------------------------------------------------------------- payment

    /// @notice Pay for an order. For an ERC-20 quote the payer must first `approve` this contract.
    /// @param q   the quote exactly as signed by the backend
    /// @param sig the backend's EIP-712 signature over `q`
    function pay(Quote calldata q, bytes calldata sig) external payable nonReentrant whenNotPaused {
        // --- checks
        if (block.timestamp > q.expiry) revert QuoteExpired();
        if (q.payer != msg.sender) revert WrongPayer();
        if (orders[q.orderId].status != Status.None) revert OrderAlreadyExists();
        if (q.amount == 0) revert ZeroAmount();
        if (!_isSignedByQuoteSigner(q, sig)) revert InvalidSignature();

        bool isNative = q.token == NATIVE;
        if (isNative) {
            if (msg.value != q.amount) revert WrongValue();
            if (oracleGuardEnabled) _checkAgainstOracle(q.amount, q.usdAmount);
        } else {
            if (!allowedToken[q.token]) revert TokenNotAllowed();
            if (msg.value != 0) revert WrongValue();
        }

        // --- effects
        orders[q.orderId] = Escrow({
            payer: msg.sender,
            token: q.token,
            amount: q.amount,
            paidAt: uint64(block.timestamp),
            status: Status.Paid
        });
        totalEscrowed[q.token] += q.amount;

        // --- interactions
        if (!isNative) {
            // Measure what actually arrived: a token that takes a fee on transfer must not be
            // escrowed for more than the contract received.
            IERC20 token = IERC20(q.token);
            uint256 balanceBefore = token.balanceOf(address(this));
            token.safeTransferFrom(msg.sender, address(this), q.amount);
            if (token.balanceOf(address(this)) - balanceBefore != q.amount) revert WrongAmountReceived();
        }

        emit OrderPaid(q.orderId, msg.sender, q.token, q.amount, q.usdAmount);
    }

    /// @notice Release an order's funds to the treasury after delivery. Fulfiller only.
    /// @param orderId the order to settle
    function settle(bytes32 orderId) external onlyFulfiller nonReentrant {
        Escrow storage order = orders[orderId];
        if (order.status != Status.Paid) revert OrderNotPaid();

        order.status = Status.Settled;
        totalEscrowed[order.token] -= order.amount;
        emit OrderSettled(orderId);

        _send(order.token, treasury, order.amount);
    }

    /// @notice Return an order's funds to the payer when delivery failed. Fulfiller only.
    ///         Works while the contract is paused.
    /// @param orderId the order to refund
    function refund(bytes32 orderId) external onlyFulfiller nonReentrant {
        Escrow storage order = orders[orderId];
        if (order.status != Status.Paid) revert OrderNotPaid();

        _refund(orderId, order, false);
    }

    /// @notice Take the funds back yourself if the order was neither settled nor refunded within
    ///         `refundTimeout`. Payer only. Works while the contract is paused.
    /// @param orderId the order to refund
    function claimRefund(bytes32 orderId) external nonReentrant {
        Escrow storage order = orders[orderId];
        if (order.status != Status.Paid) revert OrderNotPaid();
        if (msg.sender != order.payer) revert NotPayer();
        if (block.timestamp < uint256(order.paidAt) + refundTimeout) revert RefundTimeoutNotReached();

        _refund(orderId, order, true);
    }

    // ------------------------------------------------------------------ views

    /// @notice EIP-712 digest of a quote for this contract on this chain. The backend signs this value.
    /// @param q the quote
    /// @return the digest to sign
    function hashQuote(Quote calldata q) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(abi.encode(QUOTE_TYPEHASH, q.orderId, q.payer, q.token, q.amount, q.usdAmount, q.expiry))
        );
    }

    /// @notice The EIP-712 domain separator of this contract.
    /// @return the domain separator
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /// @notice Amount of `token` held by the contract that does not belong to any open order.
    /// @param token ERC-20 address, or `address(0)` for native QIE
    /// @return the amount the owner may rescue
    function rescuable(address token) public view returns (uint256) {
        uint256 balance = token == NATIVE ? address(this).balance : IERC20(token).balanceOf(address(this));
        uint256 escrowed = totalEscrowed[token];
        return balance > escrowed ? balance - escrowed : 0;
    }

    // ------------------------------------------------------------ owner admin

    /// @notice Stop new payments. Settle, refund and claimRefund keep working.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Allow new payments again.
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Replace the key whose signature authorises a price.
    /// @param quoteSigner_ the new signer
    function setQuoteSigner(address quoteSigner_) external onlyOwner {
        _setQuoteSigner(quoteSigner_);
    }

    /// @notice Replace the key that may settle and refund.
    /// @param fulfiller_ the new fulfiller
    function setFulfiller(address fulfiller_) external onlyOwner {
        _setFulfiller(fulfiller_);
    }

    /// @notice Replace the address that receives settled funds.
    /// @param treasury_ the new treasury
    function setTreasury(address treasury_) external onlyOwner {
        _setTreasury(treasury_);
    }

    /// @notice Allow or disallow an ERC-20 as a payment token. Open orders in it are not affected.
    /// @param token   the ERC-20
    /// @param allowed whether new payments in it are accepted
    function setAllowedToken(address token, bool allowed) external onlyOwner {
        _setAllowedToken(token, allowed);
    }

    /// @notice Point the oracle guard at a price feed. Its decimals are read once, here.
    /// @param oracle_ the QIE/USD feed
    function setOracle(address oracle_) external onlyOwner {
        _setOracle(oracle_);
    }

    /// @notice Set how old a feed answer may be and how far below it a native payment may be.
    /// @param maxOracleAge_       seconds
    /// @param oracleToleranceBps_ basis points, at most `MAX_ORACLE_TOLERANCE_BPS`
    function setOracleParams(uint32 maxOracleAge_, uint16 oracleToleranceBps_) external onlyOwner {
        _setOracleParams(maxOracleAge_, oracleToleranceBps_);
    }

    /// @notice Turn the oracle guard on or off, so a stale feed cannot halt native payments.
    /// @param enabled whether native payments are checked against the feed
    function setOracleGuardEnabled(bool enabled) external onlyOwner {
        _setOracleGuardEnabled(enabled);
    }

    /// @notice Recover tokens or QIE sent to the contract by mistake. Never touches escrowed funds:
    ///         at most `rescuable(token)` can be taken.
    /// @param token  ERC-20 address, or `address(0)` for native QIE
    /// @param to     recipient
    /// @param amount amount to recover
    function rescue(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount > rescuable(token)) revert ExceedsRescuable();
        emit Rescued(token, to, amount);
        _send(token, to, amount);
    }

    /// @notice Disabled: a contract without an owner could never rotate a leaked key.
    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }

    // --------------------------------------------------------------- internal

    function _isSignedByQuoteSigner(Quote calldata q, bytes calldata sig) private view returns (bool) {
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(hashQuote(q), sig);
        return err == ECDSA.RecoverError.NoError && recovered == quoteSigner;
    }

    /// @dev Reverts unless `amountWei` of QIE is worth at least `usdAmount` minus the tolerance,
    ///      at the feed price. A floor against a wrongly priced quote, not the pricing source.
    function _checkAgainstOracle(uint256 amountWei, uint256 usdAmount) private view {
        address feed = oracle;
        if (feed == address(0)) revert OracleNotSet();

        (, int256 answer,, uint256 updatedAt,) = IAggregatorV3(feed).latestRoundData();
        if (answer <= 0) revert OracleBadAnswer();
        // A timestamp in the future is as untrustworthy as an old one.
        if (updatedAt > block.timestamp || block.timestamp - updatedAt > maxOracleAge) revert OracleStale();

        // 18-decimal QIE x feed price -> 6-decimal USD, rounded down (against the payer).
        uint256 paidUsd6 = amountWei * uint256(answer) / (10 ** oracleDecimals) / QIE_TO_USD6_DIVISOR;
        if (paidUsd6 * BPS < usdAmount * (BPS - oracleToleranceBps)) revert PriceBelowOracle();
    }

    function _refund(bytes32 orderId, Escrow storage order, bool byPayer) private {
        address payer = order.payer;
        uint256 amount = order.amount;

        order.status = Status.Refunded;
        totalEscrowed[order.token] -= amount;
        emit OrderRefunded(orderId, payer, amount, byPayer);

        _send(order.token, payer, amount);
    }

    function _send(address token, address to, uint256 amount) private {
        if (token == NATIVE) {
            (bool ok,) = to.call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    function _setQuoteSigner(address quoteSigner_) private {
        if (quoteSigner_ == address(0)) revert ZeroAddress();
        quoteSigner = quoteSigner_;
        emit QuoteSignerChanged(quoteSigner_);
    }

    function _setFulfiller(address fulfiller_) private {
        if (fulfiller_ == address(0)) revert ZeroAddress();
        fulfiller = fulfiller_;
        emit FulfillerChanged(fulfiller_);
    }

    function _setTreasury(address treasury_) private {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        emit TreasuryChanged(treasury_);
    }

    function _setAllowedToken(address token, bool allowed) private {
        // address(0) means native QIE, which has its own branch in `pay`.
        if (token == address(0)) revert ZeroAddress();
        allowedToken[token] = allowed;
        emit AllowedTokenChanged(token, allowed);
    }

    function _setOracle(address oracle_) private {
        if (oracle_ == address(0)) revert ZeroAddress();
        uint8 decimals_ = IAggregatorV3(oracle_).decimals();
        oracle = oracle_;
        oracleDecimals = decimals_;
        emit OracleChanged(oracle_, decimals_);
    }

    function _setOracleParams(uint32 maxOracleAge_, uint16 oracleToleranceBps_) private {
        if (oracleToleranceBps_ > MAX_ORACLE_TOLERANCE_BPS) revert InvalidTolerance();
        maxOracleAge = maxOracleAge_;
        oracleToleranceBps = oracleToleranceBps_;
        emit OracleParamsChanged(maxOracleAge_, oracleToleranceBps_);
    }

    function _setOracleGuardEnabled(bool enabled) private {
        if (enabled && oracle == address(0)) revert OracleNotSet();
        oracleGuardEnabled = enabled;
        emit OracleGuardToggled(enabled);
    }
}
