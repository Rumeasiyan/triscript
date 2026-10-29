FROM golang:1.22-bookworm AS build

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/triscript-api .

FROM debian:trixie-slim
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        tesseract-ocr tesseract-ocr-eng tesseract-ocr-sin tesseract-ocr-tam \
        imagemagick-7.q16 curl \
    && ln -s /usr/bin/magick-im7.q16 /usr/local/bin/magick \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /out/triscript-api ./triscript-api
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=6 CMD curl -fsS http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["./triscript-api"]
