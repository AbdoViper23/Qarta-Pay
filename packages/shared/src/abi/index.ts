import { parseAbi } from 'viem';

/**
 * ABIs for the QIE contracts Qarta Pay reads or calls. Only the functions we use.
 *
 * QUSDC and the price feed are verified on the explorer (full ABIs in `../../abi/*.json`).
 * The QIEDex and QIE ID contracts are NOT verified: their signatures were read from the
 * deployed bytecode and confirmed with live calls (see `../../abi/README.md`).
 */

/** QUSDC. Plain ERC-20, 6 decimals, no EIP-2612 permit. */
export const erc20Abi = parseAbi([
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 value) returns (bool)',
  'function transfer(address to, uint256 value) returns (bool)',
  'function transferFrom(address from, address to, uint256 value) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
]);

/** QIE Oracle price feed (Chainlink AggregatorV3 interface). */
export const aggregatorV3Abi = parseAbi([
  'function decimals() view returns (uint8)',
  'function description() view returns (string)',
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function getRoundData(uint80 roundId) view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
]);

/** QIEDex router (Uniswap V2 Router02 selectors). */
export const qiedexRouterAbi = parseAbi([
  'function factory() view returns (address)',
  'function WETH() view returns (address)',
  'function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)',
  'function swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable returns (uint256[] amounts)',
]);

export const qiedexFactoryAbi = parseAbi([
  'function getPair(address tokenA, address tokenB) view returns (address pair)',
]);

export const qiedexPairAbi = parseAbi([
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
]);

/** QIE ID reverse resolver. Returns "" when it knows no name. Stale for names registered after mid-2026. */
export const qieReverseResolverAbi = parseAbi([
  'function resolve(address wallet) view returns (string name)',
]);

/**
 * QIE ID name registry. `resolver` and `domainExist` work on registries A and B.
 * `userDomain` exists on registry B only and reverts on registry A.
 */
export const qieNameRegistryAbi = parseAbi([
  'function resolver(string name) view returns (uint256 tokenId, address owner)',
  'function domainExist(string name) view returns (bool)',
  'function userDomain(address wallet) view returns (string name)',
]);

export const qieNameNftAbi = parseAbi(['function ownerOf(uint256 tokenId) view returns (address)']);
