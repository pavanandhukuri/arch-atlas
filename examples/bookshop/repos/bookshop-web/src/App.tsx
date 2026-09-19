import { useEffect, useState } from 'react';
import { listBooks, placeOrder, type Book } from './api';

export function App() {
  const [books, setBooks] = useState<Book[]>([]);
  useEffect(() => {
    void listBooks().then(setBooks);
  }, []);

  return (
    <main>
      <h1>Bookshop</h1>
      {books.map((book) => (
        <article key={book.isbn}>
          <img src={book.coverUrl} alt="" width={64} />
          <h2>{book.title}</h2>
          <p>
            {book.author} — ${book.price}
          </p>
          <button onClick={() => void placeOrder(book.isbn, 1, 'pm_card_visa', 'me@example.com')}>
            Buy
          </button>
        </article>
      ))}
    </main>
  );
}
