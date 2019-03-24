const Koa = require('koa');
const logger = require('koa-logger');
const Router = require('koa-router');
const cors = require('@koa/cors');
const serve = require('koa-static');
const { Pool } = require('pg');

const app = new Koa();
const router = new Router();

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  user: process.env.PGUSER || 'robherley',
  database: process.env.PGDATABASE || 'hst325',
  port: process.env.PGPORT || '5432',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

app.use(cors());
app.use(logger());
app.use(serve('static/'));
app.use(
  (() => {
    let db;
    return async (ctx, next) => {
      if (!db) {
        try {
          db = await pool.connect();
        } catch (err) {
          console.log('this:', err);
          db = null;
          ctx.throw(500, 'Postgres connection error');
          return;
        }
      }
      ctx.db = db;
      return next();
    };
  })()
);

const accidents = {
  countBy: t => async ctx => {
    try {
      const { rows } = await ctx.db.query(
        `SELECT *, accidentdate::string FROM accidents_by_${t}`
      );
      ctx.body = rows;
    } catch (err) {
      ctx.throw(500, err);
    }
  },
  totalBy: async ctx => {
    if (typeof ctx.request.query.date !== 'undefined') {
      try {
        const { rows } = await ctx.db.query(
          `SELECT *, accidentdate::string FROM accidents 
           WHERE accidentDate = $1::date AND 
           (latitude IS NOT NULL) AND (longitude IS NOT NULL)`,
          [ctx.request.query.date]
        );
        ctx.body = rows;
      } catch (err) {
        ctx.throw(500, err);
      }
    } else {
      ctx.throw(422, 'Missing query string "date" of format MM-DD-YYYY');
    }
  },
  totalDeaths: async ctx => {
    try {
      const { rows } = await ctx.db.query(
        `SELECT *, accidentdate::string FROM deaths 
         WHERE (latitude IS NOT NULL) AND (longitude IS NOT NULL)`
      );
      ctx.body = rows;
    } catch (err) {
      ctx.throw(500, err);
    }
  }
};

['day', 'month', 'year'].forEach(e =>
  router.get(`/count/${e}`, accidents.countBy(e))
);

router.get('/total', accidents.totalBy);
router.get('/deaths', accidents.totalDeaths);

router.all('*', async ctx => {
  ctx.body = { routes: router.stack.map(e => e.path) };
});

app.use(router.routes());

app.listen(3000);
