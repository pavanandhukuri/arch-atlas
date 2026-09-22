import { keycloak } from './auth';

export interface Book {
  isbn: string;
  title: string;
  author: string;
  price: number;
  coverUrl: string;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${keycloak.token ?? ''}`,
    },
  });
  if (!response.ok) throw new Error(`${path} failed with ${response.status}`);
  return (await response.json()) as T;
}

export const listBooks = () => call<Book[]>('/api/books/');

export const getBook = (isbn: string) => call<Book>(`/api/books/${isbn}`);

export const placeOrder = (isbn: string, quantity: number, paymentMethod: string, email: string) =>
  call<{ id: string; total: number }>('/api/orders/', {
    method: 'POST',
    body: JSON.stringify({ isbn, quantity, paymentMethod, email }),
  });
