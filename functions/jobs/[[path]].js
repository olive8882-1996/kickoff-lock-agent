import worker from "../../server/filecoin-seal-proxy-worker.mjs";

export const onRequest = ({ request, env, ctx }) => worker.fetch(request, env, ctx);

