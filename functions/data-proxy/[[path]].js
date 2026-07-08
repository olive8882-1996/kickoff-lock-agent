import worker from "../../server/data-proxy-worker.mjs";

export const onRequest = ({ request, env, ctx }) => worker.fetch(request, env, ctx);
