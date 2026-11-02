export type PricingInputs = {
  purchasePriceCny: number
  cnyToRub: number
  brokerFeePercent: number
  chinaShippingRub: number
  internationalShippingRub: number
  extraCostsRub: number
  otherFeesRub: number
  salePriceRub: number
}

export type PricingResult = {
  purchaseRub: number
  brokerFeeRub: number
  landedCostRub: number
  profitRub: number
  marginPercent: number
  markupPercent: number
}

export function calculatePricing(input: PricingInputs): PricingResult {
  const purchaseRub = input.purchasePriceCny * input.cnyToRub
  const brokerFeeRub = purchaseRub * (input.brokerFeePercent / 100)
  const landedCostRub =
    purchaseRub +
    brokerFeeRub +
    input.chinaShippingRub +
    input.internationalShippingRub +
    input.extraCostsRub +
    input.otherFeesRub
  const profitRub = input.salePriceRub - landedCostRub

  return {
    purchaseRub,
    brokerFeeRub,
    landedCostRub,
    profitRub,
    marginPercent: input.salePriceRub > 0 ? (profitRub / input.salePriceRub) * 100 : 0,
    markupPercent: landedCostRub > 0 ? (profitRub / landedCostRub) * 100 : 0,
  }
}

export function formatRub(value: number): string {
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value)} руб.`
}
