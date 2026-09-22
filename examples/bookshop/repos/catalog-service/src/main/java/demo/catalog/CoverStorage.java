package demo.catalog;

import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;

/** Book cover images are stored in an S3 bucket; clients fetch them via presigned URLs. */
@Component
public class CoverStorage {

    private final S3Presigner presigner = S3Presigner.create();
    private final String bucket;

    public CoverStorage(@Value("${bookshop.covers.bucket}") String bucket) {
        this.bucket = bucket;
    }

    public String presignedUrl(String isbn) {
        var request = GetObjectRequest.builder().bucket(bucket).key("covers/" + isbn + ".jpg").build();
        var presign = GetObjectPresignRequest.builder()
                .signatureDuration(Duration.ofMinutes(15))
                .getObjectRequest(request)
                .build();
        return presigner.presignGetObject(presign).url().toString();
    }
}
