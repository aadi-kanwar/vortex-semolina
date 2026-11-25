// Clerk issues a JWT (template name "convex"); Convex verifies it against this issuer.
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
};
