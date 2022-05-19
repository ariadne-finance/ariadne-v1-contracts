module.exports = function (_chai, utils) {
  _chai.util.snapshotBalances = async function(address, tokens) {
    const balances = await Promise.all(tokens.map(token => token.balanceOf(address)));

    const hash = {};
    for (let i=0; i<tokens.length; i++) {
      hash[tokens[i].address] = balances[i];
    }
    return hash;
  };

  utils.addMethod(_chai.Assertion.prototype, 'balancesDecreased', function(snapshotAfter) {
    const snapshotBefore = this._obj;

    for (const address of Object.keys(snapshotAfter)) {
      this.assert(snapshotAfter[address].lt(snapshotBefore[address]), `Current balance ${snapshotAfter[address]} must be < ${snapshotBefore[address]} for token ${address}`);
    }
  });

  utils.addMethod(_chai.Assertion.prototype, 'balancesIncreased', function(snapshotAfter) {
    const snapshotBefore = this._obj;

    for (const address of Object.keys(snapshotAfter)) {
      this.assert(snapshotAfter[address].gt(snapshotBefore[address]), `Current balance ${snapshotAfter[address]} must be > ${snapshotBefore[address]} for token ${address}`);
    }
  });

  utils.addProperty(_chai.Assertion.prototype, 'balancesOneIsZero', function() {
    this.assert(
      Boolean(Object.values(this._obj).find(balance => balance.eq(0))),
      `One of the token balances must be zero`
    );
  });

  utils.addProperty(_chai.Assertion.prototype, 'balancesNoneAreZero', function() {
    this.assert(
      !Boolean(Object.values(this._obj).find(balance => balance.eq(0))),
      `None of the token balances must be zero`
    );
  });

  utils.addProperty(_chai.Assertion.prototype, 'balancesAllAreZero', function() {
    this.assert(
      !Boolean(Object.values(this._obj).find(balance => balance.gt(0))),
      `All of the token balances must be zero`
    );
  });
};
