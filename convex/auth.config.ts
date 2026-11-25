// Convex Auth issues its own JWTs; CONVEX_SITE_URL is set automatically.
export default {
  providers: [{ domain: process.env.CONVEX_SITE_URL, applicationID: "convex" }],
};
