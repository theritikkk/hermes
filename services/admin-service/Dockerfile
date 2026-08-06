FROM maven:3.9.6-amazoncorretto-25-al2023 AS builder
WORKDIR /app
COPY pom.xml .
COPY src ./src
RUN mvn clean package -DskipTests

FROM amazoncorretto:25-alpine
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar
EXPOSE 8083
ENTRYPOINT ["java", "-jar", "app.jar"]