const priceFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

export const formatPrice = (value: number) => priceFormatter.format(value);
