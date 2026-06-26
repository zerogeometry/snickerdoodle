/** Pence → "£X" / "£X.XX". The one place money becomes a string. Defends
 * against a negative input (renders "-£5", never the malformed "£-5"). */
export function formatPence(pence: number): string {
  const sign = pence < 0 ? '-' : '';
  const pounds = Math.abs(pence) / 100;
  return Number.isInteger(pounds) ? `${sign}£${pounds}` : `${sign}£${pounds.toFixed(2)}`;
}
