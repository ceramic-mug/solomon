FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.work go.work.sum* ./
COPY packages/ packages/
COPY services/api/ services/api/
RUN go build -o /bin/api ./services/api/...

FROM alpine:3.19
RUN apk add --no-cache ca-certificates
COPY --from=builder /bin/api /bin/api
EXPOSE 8080
CMD ["/bin/api"]
