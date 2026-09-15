import React from 'react';

const marginColors = {
  green: 'bg-green-100 border-green-500 text-green-800',
  yellow: 'bg-yellow-100 border-yellow-500 text-yellow-800',
  red: 'bg-red-100 border-red-500 text-red-800',
};

const marginLabels = {
  green: 'Good Margin',
  yellow: 'Marginal',
  red: 'LOW MARGIN - Review!',
};

const sensitivityLabels = {
  win: 'Win the Job',
  balanced: 'Balanced',
  protect: 'Protect Margin',
};

export default function InternalQuoteView({ formData, quoteResult }) {
  const {
    basePrice, accessModifier, addOnsTotal, distanceSurcharge,
    sensitivityAdjustment, priceSensitivity,
    homeToJobMiles, jobToLandfillMiles, landfillToHomeMiles, totalRouteMiles,
    fuelCost, dumpCost, directCost,
    suggestedQuote, estimatedGrossProfit, estimatedMargin,
    grossProfitPerHour,
    profitabilityStatus, distanceWarning,
  } = quoteResult;

  return (
    <div className="space-y-4">
      <div className={`p-4 rounded-lg border-2 ${marginColors[profitabilityStatus]}`}>
        <div className="text-center">
          <div className="text-3xl font-bold">${suggestedQuote}</div>
          <div className="text-sm font-medium mt-1">{marginLabels[profitabilityStatus]}</div>
          <div className="text-sm">{(estimatedMargin * 100).toFixed(0)}% margin</div>
          {grossProfitPerHour !== null && (
            <div className="text-xs mt-0.5">${grossProfitPerHour}/hr est. gross profit</div>
          )}
        </div>
      </div>

      {distanceWarning && (
        <div className="p-3 bg-orange-100 border border-orange-400 rounded-lg text-orange-800 text-sm font-medium">
          40+ miles from landfill - Review manually! Consider increasing quote.
        </div>
      )}

      {profitabilityStatus === 'red' && (
        <div className="p-3 bg-red-100 border border-red-400 rounded-lg text-red-800 text-sm font-medium">
          Low margin job. Consider raising the price or declining.
        </div>
      )}

      <div className="bg-white rounded-lg border p-4 space-y-2">
        <h3 className="font-bold text-gray-700 border-b pb-1">Quote Breakdown</h3>
        <Row label="Base price" value={`$${basePrice}`} />
        <Row label="Access modifier" value={`${accessModifier >= 0 ? '+' : ''}$${accessModifier}`} />
        <Row label="Add-ons" value={`$${addOnsTotal}`} />
        <Row label="Distance surcharge" value={`$${distanceSurcharge}`} />
        {sensitivityAdjustment !== 0 && (
          <Row
            label={`Sensitivity (${sensitivityLabels[priceSensitivity]})`}
            value={`${sensitivityAdjustment >= 0 ? '+' : '-'}$${Math.abs(sensitivityAdjustment)}`}
          />
        )}
        <div className="border-t pt-2 font-bold">
          <Row label="Suggested Quote" value={`$${suggestedQuote}`} />
        </div>
      </div>

      <div className="bg-white rounded-lg border p-4 space-y-2">
        <h3 className="font-bold text-gray-700 border-b pb-1">Cost Analysis (Internal)</h3>
        <Row label="Home to Job" value={`${homeToJobMiles.toFixed(1)} mi`} />
        <Row label="Job to Landfill" value={`${jobToLandfillMiles.toFixed(1)} mi`} />
        <Row label="Landfill to Home" value={`${landfillToHomeMiles.toFixed(1)} mi`} />
        <Row label="Total route" value={`${totalRouteMiles.toFixed(1)} mi`} bold />
        <Row label="Fuel cost" value={`$${fuelCost.toFixed(2)}`} />
        <Row label={`Dump fee (x${formData.numberOfDumpLoads})`} value={`$${dumpCost}`} />
        <Row label="Total direct cost" value={`$${directCost.toFixed(2)}`} bold />
        <div className="border-t pt-2">
          <Row label="Estimated gross profit" value={`$${estimatedGrossProfit}`} bold />
          {grossProfitPerHour !== null && (
            <Row label="Est. gross profit/hr" value={`$${grossProfitPerHour}`} />
          )}
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-800 text-xs">
        Easy curbside jobs can be priced to win, but don't go too low. You are still charging for truck, time, fuel, disposal, convenience, and risk - not just dump fees.
      </div>
    </div>
  );
}

function Row({ label, value, bold }) {
  return (
    <div className={`flex justify-between text-sm ${bold ? 'font-bold' : ''}`}>
      <span className="text-gray-600">{label}</span>
      <span>{value}</span>
    </div>
  );
}
