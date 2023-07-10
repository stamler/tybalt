import * as functions from "firebase-functions";
import * as mysql from "mysql2";
import * as mysqlPromise from "mysql2/promise";
import { Client } from "ssh2";

const env = functions.config();
//import { env } from "./dev_creds";

export type QueryResponse = Promise<
  mysql.RowDataPacket[] |
  mysql.RowDataPacket[][] | 
  mysql.OkPacket | 
  mysql.OkPacket[] | 
  mysql.ResultSetHeader
>;

const sshClient = new Client();

/* 
Connect to a mysql database behind an SSH server by reading credentials
from google cloud functions environment variables

Usage:

const connection = await createSSHMySQLConnection2();
try {
  connection.query("....", [values]);
} catch (error) {
  console.log(error)
}
*/
export const createSSHMySQLConnection2 = () => {return new Promise<mysqlPromise.Connection>((resolve, reject) => {
  sshClient.on("ready", () => {
    sshClient.forwardOut(
      "127.0.0.1",
      3306,
      env.mysql.host,
      env.mysql.port,
      async (err, stream) => {
        if (err) reject(err);
        try {
          const connection = await mysqlPromise.createConnection({
            dateStrings: true, // don't cast DATE/DATETIME/TIMESTAMP to Date()
            host: "127.0.0.1",
            port: 3306,
            user: env.mysql.user,
            password: env.mysql.pass,
            database: env.mysql.db,
            stream,
            // https://github.com/sidorares/node-mysql2/tree/master/documentation#known-incompatibilities-with-node-mysql
            // This ensures that DECIMAL are returned as Number so we can save
            // work on the client site at the expense of possible floating point
            // errors!!
            decimalNumbers: true,
          });            
          resolve(connection);
        } catch (error) {
          reject(error);          
        }
      }
    );
  }).connect({
    host: env.mysqlssh.host,
    port: env.mysqlssh.port,
    username: env.mysqlssh.user,
    password: env.mysqlssh.pass,
  });
})};


/*
Create a mysql database pool behind an SSH server by reading credentials
from google cloud functions environment variables
*/
export const createSSHMySQLPool = () => {return new Promise<mysqlPromise.Pool>((resolve, reject) => {
  sshClient.on("ready", () => {
    sshClient.forwardOut(
      "127.0.0.1",
      3306,
      env.mysql.host,
      env.mysql.port,
      async (err, stream) => {
        if (err) reject(err);
        try {
          const pool = await mysqlPromise.createPool({
            dateStrings: true, // don't cast DATE/DATETIME/TIMESTAMP to Date()
            host: "127.0.0.1",
            port: 3306,
            user: env.mysql.user,
            password: env.mysql.pass,
            database: env.mysql.db,
            stream,
            // https://github.com/sidorares/node-mysql2/tree/master/documentation#known-incompatibilities-with-node-mysql
            // This ensures that DECIMAL are returned as Number so we can save
            // work on the client site at the expense of possible floating point
            // errors!!
            decimalNumbers: true,
          });            
          resolve(pool);
        } catch (error) {
          reject(error);          
        }
      }
    );
  }).connect({
    host: env.mysqlssh.host,
    port: env.mysqlssh.port,
    username: env.mysqlssh.user,
    password: env.mysqlssh.pass,
  });
})};

// Promisify the query() function of a mysql2 connection
export const query = (connection: mysql.Connection, q: string, values: any = undefined): QueryResponse => {
  return new Promise((resolve, reject) => {
    if (values !== undefined) {
      connection.query(q, values, (error, result)=>{
        if (error) {
          return reject(error);
        }
        return resolve(result);
      });  
    }
    connection.query(q, (error, result)=>{
      if (error) {
        return reject(error);
      }
      return resolve(result);
    });    
  });
};