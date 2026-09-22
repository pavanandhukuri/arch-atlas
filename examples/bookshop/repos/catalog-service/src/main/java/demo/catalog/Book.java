package demo.catalog;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Transient;
import java.math.BigDecimal;

@Entity
public class Book {

    @Id
    private String isbn;
    private String title;
    private String author;
    private BigDecimal price;

    @Transient
    private String coverUrl;

    protected Book() {}

    public Book withCoverUrl(String url) {
        this.coverUrl = url;
        return this;
    }

    public String getIsbn() { return isbn; }
    public String getTitle() { return title; }
    public String getAuthor() { return author; }
    public BigDecimal getPrice() { return price; }
    public String getCoverUrl() { return coverUrl; }
}
