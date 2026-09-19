package demo.catalog;

import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Read-only catalogue of books, backed by PostgreSQL. Cover images live in S3. */
@RestController
@RequestMapping("/books")
public class BookController {

    private final BookRepository books;
    private final CoverStorage covers;

    public BookController(BookRepository books, CoverStorage covers) {
        this.books = books;
        this.covers = covers;
    }

    @GetMapping
    public List<Book> list() {
        return books.findAll();
    }

    @GetMapping("/{isbn}")
    public ResponseEntity<Book> get(@PathVariable String isbn) {
        return books.findById(isbn)
                .map(book -> book.withCoverUrl(covers.presignedUrl(isbn)))
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
}
