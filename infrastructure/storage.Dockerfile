# Official MinIO source releases; no dependency on discontinued prebuilt images.
FROM golang:1.24.8-alpine AS server-build
RUN apk add --no-cache git ca-certificates
ENV CGO_ENABLED=0 GOTOOLCHAIN=local
RUN go install github.com/minio/minio@RELEASE.2025-10-15T17-29-55Z

FROM alpine:3.22 AS server
RUN apk add --no-cache ca-certificates curl && addgroup -g 10001 storage && adduser -D -u 10001 -G storage storage && mkdir /data && chown storage:storage /data
COPY --from=server-build /go/bin/minio /usr/local/bin/minio
USER storage
EXPOSE 9000 9001
ENTRYPOINT ["minio"]

FROM golang:1.24.8-alpine AS client-build
RUN apk add --no-cache git ca-certificates
ENV CGO_ENABLED=0 GOTOOLCHAIN=local
RUN go install github.com/minio/mc@RELEASE.2025-04-16T18-13-26Z

FROM alpine:3.22 AS client
RUN apk add --no-cache ca-certificates
COPY --from=client-build /go/bin/mc /usr/local/bin/mc
ENTRYPOINT ["mc"]
