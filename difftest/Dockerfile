# The reference system for differential tests: Ubuntu 24.04, bash 5.2,
# coreutils 9.4, sudo 1.9.15, tar 1.35, gzip 1.12, file 5.45,
# user hero (uid 1000) in /home/hero, C.UTF-8, UTC.
FROM ubuntu:24.10@sha256:cdf755952ed117f6126ff4e65810bf93767d4c38f5c7185b50ec1f1078b464cc
RUN userdel -r ubuntu \
 && apt-get update \
 && apt-get install -y --no-install-recommends tree less procps psmisc sudo file \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -m -u 1000 -s /bin/bash hero
ENV LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC
