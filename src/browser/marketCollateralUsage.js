const STABLECOIN_SYMBOLS = new Set([
  "DJED", "USDM", "USDA", "USDCX", "USDC", "USDT", "DAI", "EURC", "PYUSD", "IUSD",
  "WANDAI", "WANUSDC", "WANUSDT", "WANEURC", "WANPYUSD"
]);

export function categorizeMarketAsset(marketId = "", symbol = "") {
  const upperId = String(marketId || "").toUpperCase();
  const upperSym = String(symbol || "").toUpperCase();
  if (upperId.includes("LP") || upperId.includes("SUNDAE") || upperId.includes("MINSWAP") || upperId.includes("SWAP") ||
      upperSym.includes("LP") || upperSym.includes("SUNDAE") || upperSym.includes("MINSWAP")) {
    return "Stableswap LP";
  }
  if (STABLECOIN_SYMBOLS.has(upperSym) || STABLECOIN_SYMBOLS.has(upperId) ||
      upperId.includes("DJED") || upperId.includes("USDM") || upperId.includes("USDA") ||
      upperId.includes("USDC") || upperId.includes("USDT") || upperId.includes("DAI") ||
      upperId.includes("EURC") || upperId.includes("PYUSD") || upperId.includes("IUSD")) {
    return "Stablecoin";
  }
  return "Volatile Crypto";
}

export function isMatchingMarketCollateral(item, market) {
  if (!item || !market) return false;
  const targetId = String(market.id || market.marketId || "").toUpperCase();
  const targetSym = String(market.symbol || "").toUpperCase();
  const targetName = String(market.displayName || "").toUpperCase();

  const itemMarketId = String(item.market?.id || item.marketId || (!item.market && !item.qTokenName && item.id ? item.id : "")).toUpperCase();
  const itemDisplayName = String(item.market?.displayName || item.displayName || item.marketDisplayName || "").toUpperCase();
  const itemSymbol = String(item.market?.symbol || item.symbol || "").toUpperCase();
  const itemQName = String(item.qTokenName || "").toUpperCase();

  // 1. Primary: If collateral item explicitly provides its parent market ID, match strictly against targetId
  if (itemMarketId && targetId) {
    if (itemMarketId === targetId) return true;
    if (itemMarketId.endsWith(`.${targetId}`) || targetId.endsWith(`.${itemMarketId}`)) return true;
    // An explicit market ID was provided and does not match targetId. Do not cross-match to another market ID.
    return false;
  }

  // 2. Fallback when item does not provide a market ID (e.g. synthetic or mock tests):
  if (targetId && (itemSymbol === targetId || itemDisplayName === targetId)) return true;
  if (targetSym && (itemSymbol === targetSym || itemDisplayName === targetSym)) return true;
  if (targetName && (itemDisplayName === targetName || itemSymbol === targetName)) return true;

  // 3. Exact qToken name match
  if (itemQName) {
    if (targetSym && itemQName === `Q${targetSym}`) return true;
    if (targetId && itemQName === `Q${targetId}`) return true;
    if (targetName && itemQName === `Q${targetName}`) return true;
    // For bridged tokens where symbol or qToken has WAN or RS prefix (e.g. qwanBTC, qrsERG)
    if (targetSym && (itemQName === `QWAN${targetSym}` || itemQName === `QRS${targetSym}`)) return true;
    if (targetId && (itemQName === `QWAN${targetId}` || itemQName === `QRS${targetId}`)) return true;
  }

  return false;
}

export function buildMarketCollateralUsageAnalysis({ markets = [], allLoans = [] } = {}) {
  const marketList = Array.isArray(markets) ? markets : [];
  const loansList = Array.isArray(allLoans) ? allLoans : [];

  const marketNames = new Map(marketList.map((m) => [m.id, m.displayName || m.symbol || m.id]));
  const marketSymbols = new Map(marketList.map((m) => [m.id, m.symbol || m.id]));

  const byMarket = {};

  for (const market of marketList) {
    const marketId = market.id;
    const assetObj = typeof market.asset === "string" ? (() => { try { return JSON.parse(market.asset); } catch { return null; } })() : market.asset;
    const marketPrice = Number(assetObj?.price ?? market.price ?? market.priceInUsd ?? 0);
    const rawSupply = Number(market.supplyInUsd ?? market.supply ?? 0);
    const marketSupplyUsd = Number.isFinite(rawSupply) && rawSupply > 0 ? rawSupply : 0;
    const marketSupplyNative = marketPrice > 0 ? marketSupplyUsd / marketPrice : (Number(market.supplyNative) || null);

    let totalCollateralInUsd = 0;
    let activeCollateralInUsd = 0;
    let idleCollateralInUsd = 0;
    let totalAttributedDebtInUsd = 0;
    let loanCount = 0;
    let activeLoanCount = 0;

    const borrowsMap = new Map();
    const matchingLoans = [];

    for (const rawLoan of loansList) {
      let collaterals = rawLoan.collaterals || [];
      if (typeof collaterals === "string") {
        try { collaterals = JSON.parse(collaterals); } catch { collaterals = []; }
      }
      if (!Array.isArray(collaterals) || !collaterals.length) continue;

      let totalLoanCollateralInUsd = 0;
      let targetCollateralInUsd = 0;

      for (const item of collaterals) {
        const itemVal = Number(item?.amountInUsd ?? item?.amount ?? 0);
        if (Number.isFinite(itemVal) && itemVal > 0) {
          totalLoanCollateralInUsd += itemVal;
          if (isMatchingMarketCollateral(item, market)) {
            targetCollateralInUsd += itemVal;
          }
        }
      }

      if (targetCollateralInUsd <= 0) continue;

      loanCount += 1;
      totalCollateralInUsd += targetCollateralInUsd;

      const rawDebt = Number(rawLoan.adjustedAmount ?? rawLoan.amount ?? rawLoan.debtInUsd ?? 0);
      const debtInUsd = Number.isFinite(rawDebt) && rawDebt > 0 ? rawDebt : 0;
      const hasDebt = (rawLoan.hasDebt === true || String(rawLoan.hasDebt).toLowerCase() === "true") && debtInUsd > 0;
      const borrowedMarketId = String(rawLoan.marketId || rawLoan.market?.id || "Unknown");

      if (hasDebt) {
        activeLoanCount += 1;
        activeCollateralInUsd += targetCollateralInUsd;

        const collateralRatio = totalLoanCollateralInUsd > 0 ? targetCollateralInUsd / totalLoanCollateralInUsd : 0;
        const attributedDebt = debtInUsd * collateralRatio;
        totalAttributedDebtInUsd += attributedDebt;

        if (!borrowsMap.has(borrowedMarketId)) {
          const borrowedDisplayName = marketNames.get(borrowedMarketId) || borrowedMarketId;
          const borrowedSymbol = marketSymbols.get(borrowedMarketId) || borrowedMarketId;
          borrowsMap.set(borrowedMarketId, {
            borrowedMarketId,
            borrowedDisplayName,
            borrowedSymbol,
            category: categorizeMarketAsset(borrowedMarketId, borrowedSymbol),
            attributedDebtInUsd: 0,
            loanCount: 0,
            positionDebts: [],
            positionLtvs: []
          });
        }

        const bRecord = borrowsMap.get(borrowedMarketId);
        bRecord.attributedDebtInUsd += attributedDebt;
        bRecord.loanCount += 1;
        bRecord.positionDebts.push(debtInUsd);
        const ltv = Number(rawLoan.LTV ?? rawLoan.ltv ?? (totalLoanCollateralInUsd > 0 ? debtInUsd / totalLoanCollateralInUsd : 0));
        if (Number.isFinite(ltv)) bRecord.positionLtvs.push(ltv);

        matchingLoans.push({
          id: rawLoan.id,
          loanKey: String(rawLoan.id || rawLoan.publicKey || rawLoan.observedKey || ""),
          observedKey: String(rawLoan.publicKey || rawLoan.observedKey || ""),
          borrowMarketId: borrowedMarketId,
          borrowSymbol: marketSymbols.get(borrowedMarketId) || borrowedMarketId,
          borrowDisplayName: marketNames.get(borrowedMarketId) || borrowedMarketId,
          collateralNative: marketPrice > 0 ? targetCollateralInUsd / marketPrice : null,
          collateralUsd: targetCollateralInUsd,
          collateralInUsd: targetCollateralInUsd,
          totalLoanCollateralUsd: totalLoanCollateralInUsd,
          totalCollateralInUsd: totalLoanCollateralInUsd,
          collateralShare: collateralRatio,
          collateralShareOfLoan: collateralRatio,
          loanDebtUsd: debtInUsd,
          loanDebtInUsd: debtInUsd,
          attributedDebtUsd: attributedDebt,
          attributedDebtInUsd: attributedDebt,
          ltv: Number(rawLoan.LTV ?? rawLoan.ltv ?? 0),
          healthFactor: Number(rawLoan.healthFactor ?? 0)
        });
      } else {
        idleCollateralInUsd += targetCollateralInUsd;
      }
    }

    const borrows = [...borrowsMap.values()].map((b) => {
      const avgLtv = b.positionLtvs.length
        ? b.positionLtvs.reduce((sum, v) => sum + v, 0) / b.positionLtvs.length
        : 0;
      const share = totalAttributedDebtInUsd > 0 ? b.attributedDebtInUsd / totalAttributedDebtInUsd : 0;
      return {
        borrowedMarketId: b.borrowedMarketId,
        borrowedDisplayName: b.borrowedDisplayName,
        borrowedSymbol: b.borrowedSymbol,
        displayName: b.borrowedDisplayName,
        symbol: b.borrowedSymbol,
        category: b.category,
        attributedDebtInUsd: b.attributedDebtInUsd,
        attributedDebtUsd: b.attributedDebtInUsd,
        shareOfDebt: share,
        shareOfAttributedDebt: share,
        loanCount: b.loanCount,
        avgLtv
      };
    }).sort((left, right) => right.attributedDebtInUsd - left.attributedDebtInUsd);

    let stableDebt = 0;
    let lpDebt = 0;
    let volatileDebt = 0;

    for (const b of borrows) {
      if (b.category === "Stablecoin") stableDebt += b.attributedDebtInUsd;
      else if (b.category === "Stableswap LP") lpDebt += b.attributedDebtInUsd;
      else volatileDebt += b.attributedDebtInUsd;
    }

    const categoryBreakdown = [
      {
        category: "stablecoin",
        label: "Stablecoins",
        attributedDebtUsd: stableDebt,
        attributedDebtInUsd: stableDebt,
        shareOfAttributedDebt: totalAttributedDebtInUsd > 0 ? stableDebt / totalAttributedDebtInUsd : 0,
        share: totalAttributedDebtInUsd > 0 ? stableDebt / totalAttributedDebtInUsd : 0
      },
      {
        category: "stableswap_lp",
        label: "Stableswap LP tokens",
        attributedDebtUsd: lpDebt,
        attributedDebtInUsd: lpDebt,
        shareOfAttributedDebt: totalAttributedDebtInUsd > 0 ? lpDebt / totalAttributedDebtInUsd : 0,
        share: totalAttributedDebtInUsd > 0 ? lpDebt / totalAttributedDebtInUsd : 0
      },
      {
        category: "volatile_crypto",
        label: "Volatile Crypto",
        attributedDebtUsd: volatileDebt,
        attributedDebtInUsd: volatileDebt,
        shareOfAttributedDebt: totalAttributedDebtInUsd > 0 ? volatileDebt / totalAttributedDebtInUsd : 0,
        share: totalAttributedDebtInUsd > 0 ? volatileDebt / totalAttributedDebtInUsd : 0
      }
    ];

    // Maintain backward-compatible property access on the categoryBreakdown array
    categoryBreakdown.stablecoins = {
      debtInUsd: stableDebt,
      share: totalAttributedDebtInUsd > 0 ? stableDebt / totalAttributedDebtInUsd : 0
    };
    categoryBreakdown.stableswapLp = {
      debtInUsd: lpDebt,
      share: totalAttributedDebtInUsd > 0 ? lpDebt / totalAttributedDebtInUsd : 0
    };
    categoryBreakdown.volatileCrypto = {
      debtInUsd: volatileDebt,
      share: totalAttributedDebtInUsd > 0 ? volatileDebt / totalAttributedDebtInUsd : 0
    };

    const effectiveLtv = activeCollateralInUsd > 0 ? totalAttributedDebtInUsd / activeCollateralInUsd : 0;
    const activeUtilization = totalCollateralInUsd > 0 ? activeCollateralInUsd / totalCollateralInUsd : 0;
    const collateralShareOfSupply = marketSupplyUsd > 0 ? Math.min(1, totalCollateralInUsd / marketSupplyUsd) : 0;
    const uncollateralizedSupplyUsd = Math.max(0, marketSupplyUsd - totalCollateralInUsd);
    const totalCollateralNative = marketPrice > 0 ? totalCollateralInUsd / marketPrice : null;

    matchingLoans.sort((left, right) => right.attributedDebtInUsd - left.attributedDebtInUsd || right.collateralInUsd - left.collateralInUsd);

    const usage = {
      marketId,
      marketDisplayName: marketNames.get(marketId) || marketId,
      marketSymbol: marketSymbols.get(marketId) || marketId,
      displayName: marketNames.get(marketId) || marketId,
      symbol: marketSymbols.get(marketId) || marketId,
      marketSupplyUsd,
      marketSupplyNative,
      collateralShareOfSupply,
      supplyUsedAsCollateral: collateralShareOfSupply,
      uncollateralizedSupplyUsd,
      supplyCollateralizedRatio: collateralShareOfSupply,
      collateralShareOfTotalSupply: collateralShareOfSupply,
      totalCollateralInUsd,
      totalCollateralUsd: totalCollateralInUsd,
      totalCollateralNative,
      activeCollateralInUsd,
      activeCollateralUsd: activeCollateralInUsd,
      idleCollateralInUsd,
      idleCollateralUsd: idleCollateralInUsd,
      activeUtilization,
      activeCollateralUtilization: activeUtilization,
      totalAttributedDebtInUsd,
      totalAttributedDebtUsd: totalAttributedDebtInUsd,
      effectiveLtv,
      effectiveCollateralLtv: effectiveLtv,
      loanCount,
      activeLoanCount,
      idleLoanCount: loanCount - activeLoanCount,
      topBorrowedAsset: borrows[0] || null,
      borrows,
      borrowedAssets: borrows,
      categoryBreakdown,
      topLoans: matchingLoans.slice(0, 15)
    };

    byMarket[marketId] = usage;
    const upperId = String(marketId).toUpperCase();
    if (!byMarket[upperId] || (usage.totalCollateralInUsd > 0 && byMarket[upperId].totalCollateralInUsd === 0)) {
      byMarket[upperId] = usage;
    }
    if (market.symbol) {
      const upperSym = String(market.symbol).toUpperCase();
      if (!byMarket[upperSym] || (usage.totalCollateralInUsd > 0 && byMarket[upperSym].totalCollateralInUsd === 0)) {
        byMarket[upperSym] = usage;
      }
    }
  }

  let totalProtocolCollateralUsd = 0;
  let totalProtocolActiveCollateralUsd = 0;
  let totalProtocolIdleCollateralUsd = 0;
  let totalProtocolAttributedDebtUsd = 0;
  let totalProtocolSupplyUsd = 0;

  const marketCollateralList = [];
  const crossAssetPairings = [];
  const categoryMap = {
    "Volatile Crypto": { category: "Volatile Crypto", collateralUsd: 0, debtUsd: 0, borrowsByCat: {} },
    "Stablecoin": { category: "Stablecoin", collateralUsd: 0, debtUsd: 0, borrowsByCat: {} },
    "Protocol-Owned Liquidity (POL)": { category: "Protocol-Owned Liquidity (POL)", collateralUsd: 0, debtUsd: 0, borrowsByCat: {} },
    "Stableswap LP": { category: "Stableswap LP", collateralUsd: 0, debtUsd: 0, borrowsByCat: {} }
  };

  for (const market of marketList) {
    const rawSup = Number(market.supplyInUsd ?? market.supply ?? 0);
    const supUsd = Number.isFinite(rawSup) && rawSup > 0 ? rawSup : 0;
    totalProtocolSupplyUsd += supUsd;

    const u = byMarket[market.id];
    if (!u) continue;

    totalProtocolCollateralUsd += u.totalCollateralUsd;
    totalProtocolActiveCollateralUsd += u.activeCollateralUsd;
    totalProtocolIdleCollateralUsd += u.idleCollateralUsd;
    totalProtocolAttributedDebtUsd += u.totalAttributedDebtUsd;

    let collatCat = categorizeMarketAsset(market.id, market.symbol);
    if (String(market.id).toUpperCase() === "POL" || String(market.symbol || "").toUpperCase() === "POL") {
      collatCat = "Protocol-Owned Liquidity (POL)";
    }

    if (categoryMap[collatCat]) {
      categoryMap[collatCat].collateralUsd += u.totalCollateralUsd;
      categoryMap[collatCat].debtUsd += u.totalAttributedDebtUsd;
      for (const b of (u.borrowedAssets || [])) {
        categoryMap[collatCat].borrowsByCat[b.category] = (categoryMap[collatCat].borrowsByCat[b.category] || 0) + (b.attributedDebtUsd || 0);
      }
    }

    marketCollateralList.push({
      marketId: market.id,
      symbol: market.symbol || market.id,
      displayName: market.displayName || market.symbol || market.id,
      category: collatCat,
      marketSupplyUsd: supUsd,
      collateralUsd: u.totalCollateralUsd,
      activeCollateralUsd: u.activeCollateralUsd,
      idleCollateralUsd: u.idleCollateralUsd,
      collateralShareOfSupply: u.collateralShareOfSupply,
      attributedDebtUsd: u.totalAttributedDebtUsd,
      effectiveLtv: u.effectiveCollateralLtv,
      activeLoans: u.activeLoanCount,
      topBorrow: u.topBorrowedAsset
    });

    if (u.borrowedAssets && u.borrowedAssets.length) {
      for (const b of u.borrowedAssets) {
        crossAssetPairings.push({
          collateralMarketId: market.id,
          collateralSymbol: market.symbol || market.id,
          collateralDisplayName: market.displayName || market.symbol || market.id,
          collateralCategory: collatCat,
          borrowMarketId: b.borrowedMarketId,
          borrowSymbol: b.symbol || b.displayName || b.borrowedMarketId,
          borrowDisplayName: b.displayName || b.symbol || b.borrowedMarketId,
          borrowCategory: b.category,
          attributedDebtUsd: b.attributedDebtUsd,
          shareOfProtocolDebt: 0,
          loanCount: b.loanCount
        });
      }
    }
  }

  marketCollateralList.sort((a, b) => b.collateralUsd - a.collateralUsd || b.marketSupplyUsd - a.marketSupplyUsd);
  for (const m of marketCollateralList) {
    m.shareOfProtocolCollateral = totalProtocolCollateralUsd > 0 ? m.collateralUsd / totalProtocolCollateralUsd : 0;
  }

  const seenMarketKeys = new Set();
  const dedupedMarketCollateralList = marketCollateralList.filter((m) => {
    if (m.collateralUsd <= 0 && m.marketSupplyUsd < 1) return false;
    const key = (m.displayName || m.symbol || m.marketId).toUpperCase();
    if (seenMarketKeys.has(key)) return false;
    seenMarketKeys.add(key);
    return true;
  });

  const seenSpectrumMarkets = new Set();
  const collateralSpectrum = [...dedupedMarketCollateralList]
    .filter((m) => m.collateralUsd > 0)
    .sort((a, b) => b.collateralShareOfSupply - a.collateralShareOfSupply || b.collateralUsd - a.collateralUsd)
    .filter((m) => {
      const key = (m.displayName || m.symbol || m.marketId).toUpperCase();
      if (seenSpectrumMarkets.has(key)) return false;
      seenSpectrumMarkets.add(key);
      return true;
    });

  crossAssetPairings.sort((a, b) => b.attributedDebtUsd - a.attributedDebtUsd);
  for (const p of crossAssetPairings) {
    p.shareOfProtocolDebt = totalProtocolAttributedDebtUsd > 0 ? p.attributedDebtUsd / totalProtocolAttributedDebtUsd : 0;
  }

  const distinctLoanIds = new Set();
  for (const rawLoan of loansList) {
    const rawDebt = Number(rawLoan.adjustedAmount ?? rawLoan.amount ?? rawLoan.debtInUsd ?? 0);
    const hasDebt = (rawLoan.hasDebt === true || String(rawLoan.hasDebt).toLowerCase() === "true") && rawDebt > 0;
    if (hasDebt) {
      distinctLoanIds.add(String(rawLoan.id || rawLoan.publicKey || rawLoan.observedKey || ""));
    }
  }

  const topCollateral = dedupedMarketCollateralList[0] || null;
  const protocolCollateralShareOfSupply = totalProtocolSupplyUsd > 0 ? Math.min(1, totalProtocolCollateralUsd / totalProtocolSupplyUsd) : 0;
  const effectiveProtocolLtv = totalProtocolCollateralUsd > 0 ? totalProtocolAttributedDebtUsd / totalProtocolCollateralUsd : 0;

  const categoryFlowRows = Object.values(categoryMap)
    .filter((c) => c.collateralUsd > 0 || c.debtUsd > 0)
    .map((c) => ({
      category: c.category,
      collateralUsd: c.collateralUsd,
      debtUsd: c.debtUsd,
      borrowedStablecoinsUsd: c.borrowsByCat["Stablecoin"] || 0,
      borrowedStableswapLpUsd: c.borrowsByCat["Stableswap LP"] || 0,
      borrowedVolatileUsd: c.borrowsByCat["Volatile Crypto"] || 0
    }))
    .sort((a, b) => b.collateralUsd - a.collateralUsd);

  const protocol = {
    totalCollateralUsd: totalProtocolCollateralUsd,
    activeCollateralUsd: totalProtocolActiveCollateralUsd,
    idleCollateralUsd: totalProtocolIdleCollateralUsd,
    totalMarketSupplyUsd: totalProtocolSupplyUsd,
    protocolCollateralShareOfSupply,
    supplyUsedAsCollateral: protocolCollateralShareOfSupply,
    totalAttributedDebtUsd: totalProtocolAttributedDebtUsd,
    effectiveProtocolLtv,
    activeLoansCount: distinctLoanIds.size,
    topCollateralAsset: topCollateral,
    marketCollateralList: dedupedMarketCollateralList,
    collateralSpectrum,
    crossAssetPairings: crossAssetPairings.slice(0, 30),
    categoryFlowRows
  };

  return {
    byMarket,
    protocol,
    generatedAt: new Date().toISOString()
  };
}
