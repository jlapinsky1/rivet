import { Header } from './components/Header';
import { PricingPage as PricingContent } from './components/PricingPage';
import { Footer } from './components/Footer';
import './marketing.css';

export default function PricingPage() {
  return (
    <div className="marketing-page min-h-screen overflow-x-hidden">
      <Header />
      <PricingContent />
      <Footer />
    </div>
  );
}
