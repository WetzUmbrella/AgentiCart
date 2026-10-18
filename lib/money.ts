// All money is handled in integer cents. Strings are only built for PayPal bodies.

export const toCents = (usd: number): number => Math.round(usd * 100);

export const toValue = (cents: number): string => {
  if (!Number.isInteger(cents) || cents < 0) throw new Error(`Bad cents value: ${cents}`);
  return (cents / 100).toFixed(2);
};

export const fromValue = (value: string): number => toCents(Number(value));

export const formatUsd = (cents: number): string =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
