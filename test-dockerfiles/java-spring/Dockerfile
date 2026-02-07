# Java Spring Boot Application with Libraries Example
# This demonstrates Chainguard Libraries for Java detection

FROM maven:3.9-eclipse-temurin-17 AS builder

WORKDIR /app

# Copy dependency file - hover here to see library detection!
COPY pom.xml /app/

# Download dependencies
RUN mvn dependency:go-offline

COPY src /app/src

# Build application
RUN mvn clean package -DskipTests

# Runtime stage
FROM eclipse-temurin:17-jre-alpine

WORKDIR /app

COPY --from=builder /app/target/*.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
