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

const connection = await SSHMySQLConnection
try {
  connection.query("....", (err, results, fields) => { ... });
} catch (error) {
  console.log(error)
}
*/
export const createSSHMySQLConnection = () => {return new Promise<mysql.Connection>((resolve, reject) => {
  sshClient.on("ready", () => {
    sshClient.forwardOut(
      "127.0.0.1",
      3306,
      env.mysql.host,
      env.mysql.port,
      (err, stream) => {
        if (err) reject(err);
        const connection =  mysql.createConnection({
          host: "127.0.0.1",
          port: 3306,
          user: env.mysql.user,
          password: env.mysql.pass,
          database: env.mysql.db,
          stream,
        });
        connection.connect((error) => {
          if (error) reject(error);
          resolve(connection);
        });
      }
    );
  }).connect({
    host: env.mysqlssh.host,
    port: env.mysqlssh.port,
    username: env.mysqlssh.user,
    password: env.mysqlssh.pass,
  });
})};

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