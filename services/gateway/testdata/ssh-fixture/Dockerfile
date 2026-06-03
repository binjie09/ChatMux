FROM alpine:latest

ARG MUXCHAT_FIXTURE_SECRET=muxchat

RUN apk add --no-cache bash openssh-server tmux \
    && adduser -D -s /bin/bash muxchat \
    && echo "muxchat:${MUXCHAT_FIXTURE_SECRET}" | chpasswd \
    && ssh-keygen -A \
    && mkdir -p /run/sshd \
    && sed -i 's/^#PasswordAuthentication .*/PasswordAuthentication yes/' /etc/ssh/sshd_config \
    && sed -i 's/^#PermitRootLogin .*/PermitRootLogin no/' /etc/ssh/sshd_config

EXPOSE 22

CMD ["/usr/sbin/sshd", "-D", "-e"]
