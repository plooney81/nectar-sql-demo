# ── Stage 1: Build ─────────────────────────────────────────────────────────────
FROM clojure:temurin-21-tools-deps AS build

WORKDIR /app

# Cache deps before copying source (layer cache optimization)
COPY deps.edn build.clj ./
RUN clojure -P

# Copy source and resources, then build uberjar
COPY src ./src
COPY resources ./resources
RUN clojure -T:build uber

# ── Stage 2: Runtime ────────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

COPY --from=build /app/target/*-standalone.jar app.jar

EXPOSE 8080

CMD ["java", "-jar", "app.jar"]
