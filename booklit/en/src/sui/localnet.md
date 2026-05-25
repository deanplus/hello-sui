要启动本地网络，请在安装 Sui CLI 后运行以下命令:

```
RUST_LOG="off,sui_node=info" sui start --with-faucet --force-regenesis
```

访问本地全节点

```
$ curl --location --request POST 'http://127.0.0.1:9000' \
--header 'Content-Type: application/json' \
--data-raw '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "sui_getTotalTransactionBlocks",
  "params": []
}'
```

连接到本地网络

```
sui client new-env --alias local --rpc http://127.0.0.1:9000
sui client switch --env local
```

命令检查当前活动的环境：

```
sui client active-env
# local
```
