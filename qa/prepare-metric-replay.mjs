// Run only in an isolated metric/replay-N branch based on the common fixture commit.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const issue = process.argv[2];
const branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim();
if (branch !== `metric/replay-${issue}`) throw new Error(`Expected metric/replay-${issue}, found ${branch}`);
if (issue === '964') {
  const patch = execFileSync('git', ['show', '--format=', '5147d8e6977d4df7e672aa4e1d91a48a98f7e394']);
  execFileSync('git', ['apply', '--reverse', '--check'], { input: patch });
  execFileSync('git', ['apply', '--reverse'], { input: patch });
} else if (issue === '934') {
  const file = 'packages/evershop/src/components/frontStore/checkout/payment/BillingAddress.tsx';
  const source = readFileSync(file, 'utf8');
  const target = 'surface="billing"';
  if (source.split(target).length !== 3) throw new Error('Expected both billing forms');
  writeFileSync(file, source.replaceAll(target, 'surface="billing"\n                            countryScope="SHIPPING"'));
} else if (issue === '683') {
  const file = 'packages/evershop/src/modules/promotion/services/registerDefaultValidators.js';
  const source = readFileSync(file, 'utf8');
  const fixed = `      if (minimumSubTotal === null) {
        return true;
      }
      let check = false;
      if (priceIncludingTax) {
        check = cart.getData('sub_total_incl_tax') >= minimumSubTotal;
      } else {
        check = cart.getData('sub_total') >= minimumSubTotal;
      }
      return check;`;
  const broken = `      if (
        minimumSubTotal && priceIncludingTax
          ? cart.getData('sub_total_incl_tax')
          : cart.getData('sub_total') < minimumSubTotal
      ) {
        return false;
      }
      return true;`;
  if (source.split(fixed).length !== 2) throw new Error('Expected upstream fixed subtotal predicate');
  writeFileSync(file, source.replace(fixed, broken));
} else throw new Error('Expected issue 964, 934, or 683');
console.log(execFileSync('git', ['diff', '--stat'], { encoding: 'utf8' }));
