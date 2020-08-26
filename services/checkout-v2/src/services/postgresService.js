import { isValidQueryValue } from "query-validator";
import { types, Pool } from "pg";

const poolConfig = {
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: "beetravels",
  max: 20,
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 5000,
};

if (process.env.DATABASE_CERT) {
  poolConfig.ssl = {
    rejectUnauthorized: false,
    ca: process.env.DATABASE_CERT,
  };
}

const pool = new Pool(poolConfig);

types.setTypeParser(1700, function (val) {
  return parseFloat(val);
});

export function buildCheckoutPostgresQuery(confirmationId, checkoutObject) {
  let query = {
    transaction: { statement: "", values: [] },
    cartItems: { statement: "", values: [] },
  };
  const currentDate = new Date(Date.now());
  let transactionInsertStatement =
    "INSERT INTO transactions(CONFIRMATION_ID, First_Name, Last_Name, Address1, Postal_Code, State, Country, Cost, Currency_Code, Time_Stamp";
  let transactionValueStatement =
    "VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10";
  query.transaction.values = [
    confirmationId,
    isValidQueryValue(checkoutObject.billingDetails.firstName),
    isValidQueryValue(checkoutObject.billingDetails.lastName),
    isValidQueryValue(checkoutObject.billingDetails.address.line1),
    isValidQueryValue(checkoutObject.billingDetails.address.postalCode),
    isValidQueryValue(checkoutObject.billingDetails.address.state),
    isValidQueryValue(checkoutObject.billingDetails.address.country),
    isValidQueryValue(checkoutObject.totalAmount),
    isValidQueryValue(checkoutObject.currency),
    currentDate,
  ];

  if (checkoutObject.billingDetails.email) {
    query.transaction.values.push(
      isValidQueryValue(checkoutObject.billingDetails.email)
    );
    transactionInsertStatement = transactionInsertStatement + ", Email";
    transactionValueStatement =
      transactionValueStatement + ", $" + query.transaction.values.length;
  }

  if (checkoutObject.billingDetails.address.line2) {
    query.transaction.values.push(
      isValidQueryValue(checkoutObject.billingDetails.address.line2)
    );
    transactionInsertStatement = transactionInsertStatement + ", Address2";
    transactionValueStatement =
      transactionValueStatement + ", $" + query.transaction.values.length;
  }

  query.transaction.statement =
    transactionInsertStatement + ") " + transactionValueStatement + ")";

  let cartItemsStatement =
    "INSERT INTO cart_items(CONFIRMATION_ID, Type, ID, Description, Cost, Currency_Code, Start_Date, End_Date) VALUES";

  for (let item = 0; item < checkoutObject.cartItems.length; item++) {
    let cartItem = checkoutObject.cartItems[item];
    query.cartItems.values.push(
      confirmationId,
      isValidQueryValue(cartItem.type),
      isValidQueryValue(cartItem.uuid),
      isValidQueryValue(cartItem.description),
      isValidQueryValue(cartItem.cost),
      isValidQueryValue(cartItem.currency),
      new Date(isValidQueryValue(cartItem.startDate)),
      new Date(isValidQueryValue(cartItem.endDate))
    );
    let tempValuesStatement = "";
    for (
      let index = query.cartItems.values.length - 7;
      index <= query.cartItems.values.length;
      index++
    ) {
      tempValuesStatement = tempValuesStatement + "$" + index;
      if (index !== query.cartItems.values.length) {
        tempValuesStatement = tempValuesStatement + ",";
      }
    }
    cartItemsStatement = cartItemsStatement + "(" + tempValuesStatement + ")";
    if (item !== checkoutObject.cartItems.length - 1) {
      cartItemsStatement = cartItemsStatement + ",";
    }
  }

  query.cartItems.statement = cartItemsStatement;

  return query;
}

export async function setCheckoutDataToPostgres(query, context) {
  let client = null;

  try {
    // context.start("postgresClientConnect");
    client = await pool.connect();
    // context.stop();
    // context.start("postgresTransactionQuery");
    await client.query(query.transaction.statement, query.transaction.values);
    // context.stop();
    // context.start("postgresCsrtItemsQuery");
    await client.query(query.cartItems.statement, query.cartItems.values);
    // context.stop();
  } catch (err) {
    console.log(err.stack);
  } finally {
    client.release();
  }
}

export async function postgresReadinessCheck() {
  let client = null;

  try {
    client = await pool.connect();
  } catch (err) {
    return false;
  } finally {
    client.release();
  }
  return true;
}
