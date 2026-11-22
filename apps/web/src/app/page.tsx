import { TokenJourney } from '@/components/landing/TokenJourney';
import { Facts } from '@/components/landing/Facts';
import { FinalCta } from '@/components/landing/FinalCta';
import { Hero } from '@/components/landing/Hero';
import { Integrations } from '@/components/landing/Integrations';
import { Marquee } from '@/components/landing/Marquee';

export default function LandingPage() {
  return (
    <>
      <Hero />
      <Marquee />
      <TokenJourney />
      <Integrations />
      <Facts />
      <FinalCta />
    </>
  );
}
