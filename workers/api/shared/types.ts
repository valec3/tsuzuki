/**
 * Environment bindings and Context variables for the Tsuzuki Worker.
 */
export type Env = {
  Bindings: {
    tsuzuki_db: D1Database;
    CF_ACCESS_AUDIENCE_ID?: string;
  };
  Variables: {
    db: D1Database;
  };
};


