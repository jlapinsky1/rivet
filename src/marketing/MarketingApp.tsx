import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { ProblemSection } from './components/ProblemSection';
import { HowItWorks } from './components/HowItWorks';
import { DecisionEngine } from './components/DecisionEngine';
import { PriceSection } from './components/PriceSection';
import { ServiceBusinesses } from './components/ServiceBusinesses';
import { CommercialSection } from './components/CommercialSection';
import { WeeklySection } from './components/WeeklySection';
import { OnboardingSection } from './components/OnboardingSection';
import { PhilosophySection } from './components/PhilosophySection';
import { FinalCTA } from './components/FinalCTA';
import { Footer } from './components/Footer';
import './marketing.css';

function LandingPage() {
  return (
    <main>
      <Hero />
      <WeeklySection />
      <OnboardingSection />
      <ProblemSection />
      <HowItWorks />
      <DecisionEngine />
      <PriceSection />
      <ServiceBusinesses />
      <CommercialSection />
      <PhilosophySection />
      <FinalCTA />
    </main>
  );
}

export default function MarketingApp() {
  return (
    <div className="marketing-page min-h-screen overflow-x-hidden">
      <Header />
      <LandingPage />
      <Footer />
    </div>
  );
}
