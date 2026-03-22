const Anthropic = require('@anthropic-ai/sdk').default;
const { searchWeb } = require('./search');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Paper Trading Engine ──
// Jarvis tracks simulated trades to learn before risking real money

const paperPortfolio = {
  cash: 10000,
  positions: [],     // { symbol, shares, entryPrice, entryDate, type }
  tradeHistory: [],  // { symbol, action, price, shares, date, pnl }
  totalPnL: 0,
};

// ── Market Analysis ──

async function analyzeMarket(symbol) {
  const queries = [
    symbol + ' stock price today',
    symbol + ' stock analysis forecast',
    symbol + ' recent news',
  ];

  const allResults = [];
  for (const q of queries) {
    const results = await searchWeb(q);
    allResults.push(...results);
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1200,
    system: `You are a stock market analyst. Provide technical and fundamental analysis.
Include: current sentiment, key levels, catalysts, and a clear BUY/HOLD/SELL recommendation.
Always mention risks. Be specific with numbers.`,
    messages: [{
      role: 'user',
      content: symbol + ' analysis\n\nRecent data:\n' + allResults.map(r => r.title + ': ' + r.snippet).join('\n'),
    }],
  });

  return { symbol, analysis: response.content[0].text, sources: allResults.length };
}

// ── Strategy Learning ──

async function learnStrategy(description, tenantId) {
  const memory = require('./memory');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    system: `You are a trading strategy analyst. Break down trading strategies into:
1. Entry rules (specific conditions)
2. Exit rules (take profit and stop loss)
3. Position sizing
4. Risk management
5. Best market conditions for this strategy
6. Common mistakes to avoid

Be precise and mechanical — these rules should be programmable.`,
    messages: [{
      role: 'user',
      content: 'Learn and codify this trading strategy:\n\n' + description,
    }],
  });

  const analysis = response.content[0].text;

  if (tenantId) {
    await memory.storeMemory(
      tenantId,
      'training',
      'Trading strategy learned: ' + analysis.substring(0, 500),
      9,
      'trading_engine'
    );
  }

  return { strategy: analysis };
}

// ── Paper Trade Execution ──

function paperBuy(symbol, shares, price, reason) {
  const cost = shares * price;
  if (cost > paperPortfolio.cash) {
    return 'Insufficient paper cash. Available: $' + paperPortfolio.cash.toFixed(2) + ', Need: $' + cost.toFixed(2);
  }

  paperPortfolio.cash -= cost;
  paperPortfolio.positions.push({
    symbol,
    shares,
    entryPrice: price,
    entryDate: new Date().toISOString(),
    reason: reason || '',
  });
  paperPortfolio.tradeHistory.push({
    symbol, action: 'BUY', price, shares,
    date: new Date().toISOString(), pnl: 0,
  });

  return 'PAPER BUY: ' + shares + ' ' + symbol + ' @ $' + price + ' = $' + cost.toFixed(2) +
    ' | Cash remaining: $' + paperPortfolio.cash.toFixed(2);
}

function paperSell(symbol, shares, price, reason) {
  const posIndex = paperPortfolio.positions.findIndex(p => p.symbol === symbol && p.shares >= shares);
  if (posIndex === -1) return 'No position in ' + symbol + ' with ' + shares + ' shares';

  const pos = paperPortfolio.positions[posIndex];
  const pnl = (price - pos.entryPrice) * shares;
  const proceeds = shares * price;

  paperPortfolio.cash += proceeds;
  paperPortfolio.totalPnL += pnl;

  if (pos.shares === shares) {
    paperPortfolio.positions.splice(posIndex, 1);
  } else {
    pos.shares -= shares;
  }

  paperPortfolio.tradeHistory.push({
    symbol, action: 'SELL', price, shares,
    date: new Date().toISOString(), pnl,
  });

  const pnlStr = pnl >= 0 ? '+$' + pnl.toFixed(2) : '-$' + Math.abs(pnl).toFixed(2);
  return 'PAPER SELL: ' + shares + ' ' + symbol + ' @ $' + price + ' | P&L: ' + pnlStr +
    ' | Cash: $' + paperPortfolio.cash.toFixed(2) + ' | Total P&L: $' + paperPortfolio.totalPnL.toFixed(2);
}

function getPortfolioStatus() {
  let status = 'Paper Portfolio:\n';
  status += 'Cash: $' + paperPortfolio.cash.toFixed(2) + '\n';
  status += 'Total P&L: $' + paperPortfolio.totalPnL.toFixed(2) + '\n';

  if (paperPortfolio.positions.length) {
    status += '\nOpen Positions:\n';
    paperPortfolio.positions.forEach(p => {
      status += '  ' + p.symbol + ': ' + p.shares + ' shares @ $' + p.entryPrice + ' (since ' + p.entryDate.split('T')[0] + ')\n';
    });
  } else {
    status += 'No open positions.\n';
  }

  if (paperPortfolio.tradeHistory.length) {
    status += '\nRecent Trades:\n';
    paperPortfolio.tradeHistory.slice(-5).forEach(t => {
      const pnlStr = t.pnl ? (t.pnl >= 0 ? ' +$' + t.pnl.toFixed(2) : ' -$' + Math.abs(t.pnl).toFixed(2)) : '';
      status += '  ' + t.action + ' ' + t.shares + ' ' + t.symbol + ' @ $' + t.price + pnlStr + '\n';
    });
  }

  return status;
}

// ── Crypto Analysis ──

async function analyzeCrypto(symbol) {
  const results = await searchWeb(symbol + ' crypto price analysis today');
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system: 'You are a crypto analyst. Give current price action, key levels, and short-term outlook. Be direct.',
    messages: [{
      role: 'user',
      content: symbol + ' analysis:\n' + results.map(r => r.title + ': ' + r.snippet).join('\n'),
    }],
  });
  return { symbol, analysis: response.content[0].text };
}

module.exports = {
  analyzeMarket,
  learnStrategy,
  paperBuy,
  paperSell,
  getPortfolioStatus,
  analyzeCrypto,
  paperPortfolio,
};
