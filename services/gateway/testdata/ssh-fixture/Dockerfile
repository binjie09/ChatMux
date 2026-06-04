FROM alpine:latest

ARG CHATMUX_FIXTURE_SECRET=chatmux

RUN apk add --no-cache bash openssh-server tmux \
    && adduser -D -s /bin/bash chatmux \
    && echo "chatmux:${CHATMUX_FIXTURE_SECRET}" | chpasswd \
    && ssh-keygen -A \
    && mkdir -p /run/sshd \
    && sed -i 's/^#PasswordAuthentication .*/PasswordAuthentication yes/' /etc/ssh/sshd_config \
    && sed -i 's/^#PermitRootLogin .*/PermitRootLogin no/' /etc/ssh/sshd_config

EXPOSE 22

CMD ["/usr/sbin/sshd", "-D", "-e"]
