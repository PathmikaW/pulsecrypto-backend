import fp from 'fastify-plugin';

// Empty on purpose — no options yet, but the interface shape matters for Fastify's
// generic plugin typing (a Record<string, never> alternative is structurally incompatible
// with FastifyPluginOptions' index signature — tried, reverted). allowInterfaces: 'always'
// in eslint.config.mjs permits this specific, idiomatic Fastify pattern project-wide.
export interface SupportPluginOptions {}

// The use of fastify-plugin is required to be able
// to export the decorators to the outer scope
export default fp<SupportPluginOptions>(async (fastify, _opts) => {
  fastify.decorate('someSupport', function () {
    return 'hugs';
  });
});

// When using .decorate you have to specify added properties for Typescript
declare module 'fastify' {
  export interface FastifyInstance {
    someSupport(): string;
  }
}
