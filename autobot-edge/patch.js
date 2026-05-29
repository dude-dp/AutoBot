const fs = require('fs');
let code = fs.readFileSync('src/index.tsx', 'utf8');
code = code.replace(
`    const batchSize = 45; // Below 50 limit to be safe
    let totalCrossovers = 0;
    let totalProcessed = 0;
    const newCrossovers: string[] = [];

    for (let i = 0; i < stocks.length; i += batchSize) {
      const chunk = stocks.slice(i, i + batchSize);
      await log(\`📡 Scanning batch \${Math.floor(i / batchSize) + 1} of \${Math.ceil(stocks.length / batchSize)}...\`, "info");

      const promises = chunk.map(async (stock) => {
        try {
          const url = \`https://api.upstox.com/v3/historical-candle/\${encodeURIComponent(stock.instrument_key)}/hours/3/\${toDate}/\${fromDate}\`;
          const res = await fetch(url, {
            headers: {
              'Accept': 'application/json',
              'Authorization': \`Bearer \${accessToken}\`
            }
          });

          if (!res.ok) return null;
          const json: any = await res.json();
          if (json.status !== 'success' || !json.data || !json.data.candles) return null;

          const candles = json.data.candles;
          if (candles.length < 28) return null; // We need at least 26 slow EMA period + signal buffering

          // Sort candles oldest to newest (chronological)
          candles.sort((a: any, b: any) => new Date(a[0]).getTime() - new Date(b[0]).getTime());

          // Extract closing prices
          const prices = candles.map((c: any) => parseFloat(c[4]));
          const { macdLine } = calculateMACD(prices);
          
          if (macdLine.length < 2) return null;

          const currentMacd = macdLine[macdLine.length - 1];
          const previousMacd = macdLine[macdLine.length - 2];
          const isCrossingAboveZero = previousMacd < 0 && currentMacd > 0;

          return {
            instrument_key: stock.instrument_key,
            trading_symbol: stock.trading_symbol,
            macd_cross_3h: isCrossingAboveZero,
            was_crossing: !!stock.macd_cross_3h
          };
        } catch (err) {
          return null;
        }
      });

      const results = await Promise.all(promises);
      const validResults = results.filter(r => r !== null) as { 
        instrument_key: string; 
        trading_symbol: string; 
        macd_cross_3h: boolean; 
        was_crossing: boolean; 
      }[];
      
      // Filter out newly crossing stocks (false/null -> true)
      const batchNewCrossovers = validResults.filter(r => r.macd_cross_3h && !r.was_crossing);
      if (batchNewCrossovers.length > 0) {
        newCrossovers.push(...batchNewCrossovers.map(r => r.trading_symbol));
      }

      const crossesInBatch = validResults.filter(r => r.macd_cross_3h).length;
      totalCrossovers += crossesInBatch;
      totalProcessed += validResults.length;

      // Update Supabase in bulk for this batch
      if (validResults.length > 0) {
        const payload = validResults.map(r => ({
          instrument_key: r.instrument_key,
          macd_cross_3h: r.macd_cross_3h
        }));
        const { error: rpcError } = await supabase.rpc('bulk_update_macd', { payload });
        if (rpcError) {
          console.error("Supabase RPC bulk_update_macd error:", rpcError);
        }
      }

      // Throttling: Delay 8 seconds between batches to stay under the 500 requests/minute limit
      if (i + batchSize < stocks.length) {
        await new Promise(resolve => setTimeout(resolve, 8000));
      }
    }`,
`    const batchSize = 100; // Increased batch size
    let totalCrossovers = 0;
    let totalProcessed = 0;
    const newCrossovers: string[] = [];

    for (let i = 0; i < stocks.length; i += batchSize) {
      const chunk = stocks.slice(i, i + batchSize);
      await log(\`📡 Scanning batch \${Math.floor(i / batchSize) + 1} of \${Math.ceil(stocks.length / batchSize)}...\`, "info");

      const promises = chunk.map(async (stock, index) => {
        // Stagger requests within the batch to avoid hitting the per-second rate limit too hard (e.g. 10/sec)
        await new Promise(resolve => setTimeout(resolve, index * 100));
        
        let attempts = 0;
        while (attempts < 3) {
          try {
            const url = \`https://api.upstox.com/v3/historical-candle/\${encodeURIComponent(stock.instrument_key)}/hours/3/\${toDate}/\${fromDate}\`;
            const res = await fetch(url, {
              headers: {
                'Accept': 'application/json',
                'Authorization': \`Bearer \${accessToken}\`
              }
            });

            if (res.status === 429) {
              attempts++;
              await new Promise(resolve => setTimeout(resolve, 2000 * attempts));
              continue;
            }

            if (!res.ok) return null;
            const json: any = await res.json();
            if (json.status !== 'success' || !json.data || !json.data.candles) return null;

            const candles = json.data.candles;
            if (candles.length < 28) return null; // We need at least 26 slow EMA period + signal buffering

            // Sort candles oldest to newest (chronological)
            candles.sort((a: any, b: any) => new Date(a[0]).getTime() - new Date(b[0]).getTime());

            // Extract closing prices
            const prices = candles.map((c: any) => parseFloat(c[4]));
            const { macdLine } = calculateMACD(prices);
            
            if (macdLine.length < 2) return null;

            const currentMacd = macdLine[macdLine.length - 1];
            const previousMacd = macdLine[macdLine.length - 2];
            const isCrossingAboveZero = previousMacd < 0 && currentMacd > 0;

            return {
              instrument_key: stock.instrument_key,
              trading_symbol: stock.trading_symbol,
              macd_cross_3h: isCrossingAboveZero,
              was_crossing: !!stock.macd_cross_3h
            };
          } catch (err) {
            attempts++;
            if (attempts >= 3) return null;
            await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
          }
        }
        return null;
      });

      const results = await Promise.all(promises);
      const validResults = results.filter(r => r !== null) as { 
        instrument_key: string; 
        trading_symbol: string; 
        macd_cross_3h: boolean; 
        was_crossing: boolean; 
      }[];
      
      // Filter out newly crossing stocks (false/null -> true)
      const batchNewCrossovers = validResults.filter(r => r.macd_cross_3h && !r.was_crossing);
      if (batchNewCrossovers.length > 0) {
        newCrossovers.push(...batchNewCrossovers.map(r => r.trading_symbol));
      }

      const crossesInBatch = validResults.filter(r => r.macd_cross_3h).length;
      totalCrossovers += crossesInBatch;
      totalProcessed += validResults.length;

      // Update Supabase in bulk for this batch
      if (validResults.length > 0) {
        const payload = validResults.map(r => ({
          instrument_key: r.instrument_key,
          macd_cross_3h: r.macd_cross_3h
        }));
        const { error: rpcError } = await supabase.rpc('bulk_update_macd', { payload });
        if (rpcError) {
          console.error("Supabase RPC bulk_update_macd error:", rpcError);
        }
      }

      // Dynamic throttling: Only wait 1 second between batches. The internal stagger and retry logic handles the limits.
      if (i + batchSize < stocks.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }`
);
fs.writeFileSync('src/index.tsx', code);
