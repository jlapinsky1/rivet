import VerticalQuoteForm from './VerticalQuoteForm';
import { getDefaultQuoteFormConfig } from '../utils/quoteFormConfig';

const config = getDefaultQuoteFormConfig('junk_removal');

export default function BookingFlow() {
  return <VerticalQuoteForm config={config} businessName="Squatterz" businessSlug={null} />;
}
