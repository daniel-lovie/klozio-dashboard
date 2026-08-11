# Railway deploy image. Nixpacks/Railpack builds were dying on the Metal builder
# with zero logs, so we pin the whole build ourselves.
FROM node:22-alpine

# personalizer agent: chroma print processing runs in python
# The server-side producer runs the same Python as the local pipeline, so the container needs its
# dependencies — not just the image libraries:
#   py3-psycopg2  every producer script reads and writes the database; without it production failed on
#                 every product and marked each one 'error' while the build looked perfectly healthy.
#   ttf-dejavu    scripts/produce_images.py hand-sets the colourway badge. With no TrueType font PIL
#                 falls back to a bitmap default and the badge renders unreadably small — a listing
#                 image that ships looking broken.
#   ttf-liberation  scripts/typeset.py sets captions in a serif and posters in a condensed face;
#                 Liberation carries a Times clone and a genuinely narrow Sans, which are the two
#                 shapes the best-selling designs use. Without it the type falls back to DejaVu and
#                 the words read generic — the module warns when that happens rather than hiding it.
RUN apk add --no-cache python3 py3-numpy py3-scipy py3-pillow py3-psycopg2 librsvg \
        ttf-dejavu ttf-liberation

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# NEXT_PUBLIC_* variables are inlined into the client bundle at BUILD time, not read at runtime. Without
# this ARG the publishable key was absent during `npm run build`, so the browser received `undefined`
# while the server (which does see the secret at runtime) still rendered ClerkProvider — every page threw,
# the healthcheck failed, and the deploy was marked failed even though the build had succeeded. Railway
# passes service variables as build args, but only for the ARGs a Dockerfile declares.
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

RUN npm run build

ENV NODE_ENV=production
# migration is idempotent; runs on every boot before the server starts
CMD ["sh", "scripts/boot.sh"]
