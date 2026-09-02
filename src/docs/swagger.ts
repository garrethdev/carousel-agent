import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Carousel Generator API",
      version: "1.0.0",
      description: "API endpoints for generating LinkedIn-style carousels and for the Virlo slideshow research lane."
    }
  },
  apis: ["src/api/carouselRoute.ts", "src/api/virloRoute.ts"]
};

export const swaggerSpec = swaggerJsdoc(options);

