FROM golang:1.23-alpine AS build

RUN apk add --no-cache gcc musl-dev

WORKDIR /src/services/gateway

COPY services/gateway/go.mod services/gateway/go.sum ./
RUN go mod download

COPY services/gateway ./
RUN CGO_ENABLED=1 go build -o /out/chatmux-gateway ./cmd/chatmux-gateway

FROM alpine:3.21

RUN apk add --no-cache ca-certificates openssh-client tmux

WORKDIR /app

COPY --from=build /out/chatmux-gateway /usr/local/bin/chatmux-gateway

ENV CHATMUX_ADDR=:19327
ENV CHATMUX_DB=/data/chatmux.db

VOLUME ["/data"]
EXPOSE 19327

CMD ["chatmux-gateway"]
