const CATALOG_URL = process.env.CATALOG_URL ?? 'http://catalog-service:8081';

/** Look a book up in the catalog-service and return its unit price. */
export async function priceOf(isbn: string): Promise<number> {
  const response = await fetch(`${CATALOG_URL}/books/${isbn}`);
  if (!response.ok) throw new Error(`catalog-service returned ${response.status} for ${isbn}`);
  const book = (await response.json()) as { price: number };
  return book.price;
}
