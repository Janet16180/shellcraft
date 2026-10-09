# The reference system for differential tests: Ubuntu 24.04, bash 5.2,
# coreutils 9.4, user hero (uid 1000) in /home/hero, C.UTF-8, UTC.
FROM ubuntu:24.04@sha256:534baea6a22c03a63003dbc8dbe78fe34bc0d7e595d9a9dc9834884ff530eb55
RUN userdel -r ubuntu \
 && apt-get update \
 && apt-get install -y --no-install-recommends tree less procps psmisc \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -m -u 1000 -s /bin/bash hero
ENV LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC
