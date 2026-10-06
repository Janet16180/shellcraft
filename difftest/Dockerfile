# The reference system for differential tests: Ubuntu 24.04, bash 5.2,
# coreutils 9.4, user hero (uid 1000) in /home/hero, C.UTF-8, UTC.
FROM ubuntu:24.04
RUN userdel -r ubuntu \
 && apt-get update \
 && apt-get install -y --no-install-recommends tree less procps psmisc \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -m -u 1000 -s /bin/bash hero
ENV LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC
