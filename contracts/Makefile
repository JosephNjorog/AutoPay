.PHONY: setup build test test-v clean deploy-fuji deploy-mainnet fmt lint

# Install Foundry dependencies
setup:
	forge install OpenZeppelin/openzeppelin-contracts --no-commit
	forge install eth-infinitism/account-abstraction --no-commit

# Compile all contracts
build:
	forge build

# Run all tests (quiet)
test:
	forge test

# Run tests with verbose output
test-v:
	forge test -vvv

# Run a single test file (make test-file FILE=TumaEscrow)
test-file:
	forge test --match-path "test/$(FILE).t.sol" -vvv

# Format Solidity files
fmt:
	forge fmt

# Check format without writing
lint:
	forge fmt --check

# Show test coverage
coverage:
	forge coverage

# Deploy to Avalanche Fuji testnet
deploy-fuji:
	forge script script/Deploy.s.sol \
		--rpc-url fuji \
		--broadcast \
		--verify \
		-vvvv

# Deploy to Avalanche mainnet (requires explicit confirmation)
deploy-mainnet:
	@echo "WARNING: Deploying to Avalanche MAINNET. Press Ctrl+C to abort."
	@sleep 5
	forge script script/Deploy.s.sol \
		--rpc-url avalanche \
		--broadcast \
		--verify \
		-vvvv

# Clean build artifacts
clean:
	forge clean

# Show gas usage for all tests
gas:
	forge test --gas-report
