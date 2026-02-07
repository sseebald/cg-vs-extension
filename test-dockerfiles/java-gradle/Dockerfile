# Java Gradle Application with Libraries Example
# This demonstrates Chainguard Libraries for Java (Gradle) detection

FROM gradle:8.5-jdk17 AS builder

WORKDIR /app

# Copy dependency file - hover here to see library detection!
COPY build.gradle settings.gradle /app/

# Download dependencies
RUN gradle dependencies --no-daemon

COPY src /app/src

# Build application
RUN gradle build --no-daemon -x test

# Runtime stage
FROM eclipse-temurin:17-jre-alpine

WORKDIR /app

COPY --from=builder /app/build/libs/*.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
