FROM golang:1.26-alpine AS builder
WORKDIR /build

# Copy workspace files first so module graph resolves
COPY go.work go.work.sum ./
COPY packages/ packages/
COPY services/api/ services/api/

RUN go build -o /bin/api ./services/api

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
COPY --from=builder /bin/api /bin/api

# Working directory matches the volume mount so key file lookups work
WORKDIR /app

EXPOSE 8080
CMD ["/bin/api"]
