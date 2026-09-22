# catalog-service

Spring Boot service that owns the book catalogue. Serves `GET /books` and `GET /books/{isbn}`,
keeps books in **PostgreSQL** and hands out presigned **Amazon S3** URLs for cover images.
