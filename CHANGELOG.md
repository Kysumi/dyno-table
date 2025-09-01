## [2.1.1](https://github.com/Kysumi/dyno-table/compare/v2.1.0...v2.1.1) (2025-09-01)


### Bug Fixes

* Filters can now be chained ([#56](https://github.com/Kysumi/dyno-table/issues/56)) ([76cf104](https://github.com/Kysumi/dyno-table/commit/76cf10423d59db32e9ff1e7b9fbf4a1c84f1c5d4)), closes [USER#123](https://github.com/USER/issues/123) [USER#123](https://github.com/USER/issues/123)

# [2.1.0](https://github.com/Kysumi/dyno-table/compare/v2.0.2...v2.1.0) (2025-08-25)


### Features

* Readonly Indexes added and Validation rules for updating GSI index attributes ([03e3407](https://github.com/Kysumi/dyno-table/commit/03e3407e2ce8c27e9d478fbfc58ec141d674a2aa))

## [2.0.2](https://github.com/Kysumi/dyno-table/compare/v2.0.1...v2.0.2) (2025-08-22)


### Bug Fixes

* Set and Remove not working correctly on nested attributes ([#54](https://github.com/Kysumi/dyno-table/issues/54)) ([e1c6bc4](https://github.com/Kysumi/dyno-table/commit/e1c6bc4340b997126b1e745f6b2d869a10fcd2ee))

## [2.0.1](https://github.com/Kysumi/dyno-table/compare/v2.0.0...v2.0.1) (2025-07-23)


### Bug Fixes

* inconsistent timestamps between index and what is on the item ([#53](https://github.com/Kysumi/dyno-table/issues/53)) ([1a1b3a0](https://github.com/Kysumi/dyno-table/commit/1a1b3a089bceb622b13039cfbd3a640f1b8c5693))

# [2.0.0](https://github.com/Kysumi/dyno-table/compare/v1.7.0...v2.0.0) (2025-07-09)


### Features

* add async result iterator ([8e5cd0c](https://github.com/Kysumi/dyno-table/commit/8e5cd0c33d9380966c92cac55ca0c1e2f27480e7))


### BREAKING CHANGES

* The return type of execute is no longer an object containing items, it now returns an iterator object which you can use `for await` to iterate all items from your query result. Alternatively you can use result.toArray() to eager load all results into memory

const result = await table.query<Dinosaur>({ pk: "dinosaur#large" }).execute();

for await (const item of result) {
  // do stuff here...
}

# [1.7.0](https://github.com/Kysumi/dyno-table/compare/v1.6.0...v1.7.0) (2025-07-07)


### Features

* BatchBuilder functionality ([aacd484](https://github.com/Kysumi/dyno-table/commit/aacd48439b54dcb682c52a856257f2a18fecfb4a))

# [1.6.0](https://github.com/Kysumi/dyno-table/compare/v1.5.0...v1.6.0) (2025-06-02)


### Features

* Adding defaults support using input and output types ([#48](https://github.com/Kysumi/dyno-table/issues/48)) ([1544e43](https://github.com/Kysumi/dyno-table/commit/1544e435ed37c05c80f9c35f386343e13cd90087))

# [1.5.0](https://github.com/Kysumi/dyno-table/compare/v1.4.0...v1.5.0) (2025-05-30)


### Features

* **core:** introduce centralized index exports and update module structure ([#46](https://github.com/Kysumi/dyno-table/issues/46)) ([e529ea5](https://github.com/Kysumi/dyno-table/commit/e529ea5731d8df543b2b104b8049963bd24dd760))

# [1.4.0](https://github.com/Kysumi/dyno-table/compare/v1.3.1...v1.4.0) (2025-05-30)


### Features

* **conditions:** add support for `IN` operator with `inArray` function and related tests ([#45](https://github.com/Kysumi/dyno-table/issues/45)) ([527e471](https://github.com/Kysumi/dyno-table/commit/527e4713ad3960b6cb4409fc1ef4ee20afc94792))

## [1.3.1](https://github.com/Kysumi/dyno-table/compare/v1.3.0...v1.3.1) (2025-05-28)

# [1.3.0](https://github.com/Kysumi/dyno-table/compare/v1.2.0...v1.3.0) (2025-05-28)


### Features

* **table:** refactor `transaction` method to be an `async` function ([#41](https://github.com/Kysumi/dyno-table/issues/41)) ([bdc5a75](https://github.com/Kysumi/dyno-table/commit/bdc5a756a08188ac7f278d8f0a1bafab7070f7c3))

# [1.2.0](https://github.com/Kysumi/dyno-table/compare/v1.1.0...v1.2.0) (2025-05-27)


### Features

* **entity:** Transactions updates ([#40](https://github.com/Kysumi/dyno-table/issues/40)) ([0d7b65f](https://github.com/Kysumi/dyno-table/commit/0d7b65f02770857c26e2fa1dfbb1260f0764177b))

# [1.1.0](https://github.com/Kysumi/dyno-table/compare/v1.0.0...v1.1.0) (2025-05-26)


### Features

* **entity:** Transaction support ([#39](https://github.com/Kysumi/dyno-table/issues/39)) ([5497269](https://github.com/Kysumi/dyno-table/commit/54972691274d81fbcfb9041be4449c90d7815d4f))

# 1.0.0 (2025-05-12)


### Bug Fixes

* update build in package.json ([#32](https://github.com/Kysumi/dyno-table/issues/32)) ([bbbbb3b](https://github.com/Kysumi/dyno-table/commit/bbbbb3b54e037cca4c341c956c0f4204ec09c162))

# 1.0.0-alpha.1 (2025-05-11)


### Bug Fixes

* update build in package.json ([#32](https://github.com/Kysumi/dyno-table/issues/32)) ([bbbbb3b](https://github.com/Kysumi/dyno-table/commit/bbbbb3b54e037cca4c341c956c0f4204ec09c162))
