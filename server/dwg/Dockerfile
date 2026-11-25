# EstimatePro — DWG → DXF converter (LibreDWG dwg2dxf, GPL-3.0, used as a separate program on your own server)
FROM debian:bookworm-slim AS build
ARG LDWG=0.13.3
RUN apt-get update && apt-get install -y --no-install-recommends build-essential curl xz-utils ca-certificates python3 && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL "https://github.com/LibreDWG/libredwg/releases/download/${LDWG}/libredwg-${LDWG}.tar.xz" | tar -xJ -C / && mv /libredwg-${LDWG} /src \
 && cd /src && ./configure --disable-bindings --disable-docs --disable-python --prefix=/opt/ldwg && make -j"$(nproc)" && make install

FROM node:20-bookworm-slim
COPY --from=build /opt/ldwg /opt/ldwg
ENV PATH="/opt/ldwg/bin:$PATH" LD_LIBRARY_PATH="/opt/ldwg/lib" PORT=8088
WORKDIR /app
COPY server.js .
USER node
EXPOSE 8088
CMD ["node", "server.js"]
