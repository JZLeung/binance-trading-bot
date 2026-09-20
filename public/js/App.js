/* eslint-disable react/jsx-no-undef */
/* eslint-disable no-undef */

class App extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      eventStream: {
        instance: null,
        connected: false
      },
      packageVersion: '',
      gitHash: '',
      configuration: {},
      orderStats: {},
      exchangeSymbols: [],
      symbols: [],
      apiInfo: {},
      accountInfo: {},
      closedTrades: [],
      publicURL: '',
      dustTransfer: {},
      availableSortOptions: [
        { sortBy: 'default', sortByDesc: false, label: 'Default' },
        {
          sortBy: 'buy-difference',
          sortByDesc: false,
          label: 'Buy - Difference (asc)'
        },
        {
          sortBy: 'buy-difference',
          sortByDesc: true,
          label: 'Buy - Difference (desc)'
        },
        {
          sortBy: 'sell-profit',
          sortByDesc: false,
          label: 'Sell - Profit (asc)'
        },
        {
          sortBy: 'sell-profit',
          sortByDesc: true,
          label: 'Sell - Profit (desc)'
        },
        { sortBy: 'alpha', sortByDesc: false, label: 'Alphabetical (asc)' },
        { sortBy: 'alpha', sortByDesc: true, label: 'Alphabetical (desc)' }
      ],
      selectedSortOption: {
        sortBy: 'default',
        sortByDesc: false,
        hideInactive: false
      },
      searchKeyword: '',
      isLoaded: false,
      isAuthenticated: false,
      botOptions: {},
      authToken: localStorage.getItem('authToken') || '',
      totalProfitAndLoss: {},
      streamsCount: 0,
      monitoringSymbolsCount: 0,
      cachedMonitoringSymbolsCount: 0,
      page: 1,
      totalPages: 1,
      tradingViewIntervals: ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '1d'],
      tradingViews: [],
      eventStreamDisconnectedNotified: false
    };
    this.requestLatest = this.requestLatest.bind(this);
    this.connectEventStream = this.connectEventStream.bind(this);
    this.sendWebSocket = this.sendWebSocket.bind(this);
    this.setSortOption = this.setSortOption.bind(this);
    this.setSearchKeyword = this.setSearchKeyword.bind(this);
    this.setPage = this.setPage.bind(this);

    this.toast = this.toast.bind(this);

    this.notyf = new Notyf({
      types: [
        {
          type: 'info',
          background: '#bf9106',
          icon: {
            className: 'fas fa-info-circle fa-lg',
            tagName: 'i',
            text: '',
            color: 'white'
          }
        },
        {
          type: 'buy',
          background: '#02c076',
          icon: {
            className: 'fas fa-info-circle fa-lg',
            tagName: 'i',
            text: '',
            color: 'white'
          }
        },
        {
          type: 'sell',
          background: '#bf374a',
          icon: {
            className: 'fas fa-info-circle fa-lg',
            tagName: 'i',
            text: '',
            color: 'white'
          }
        },
        {
          type: 'success',
          background: '#17a9bf',
          icon: {
            className: 'fas fa-info-circle fa-lg',
            tagName: 'i',
            text: '',
            color: 'white'
          }
        },
        {
          type: 'warning',
          background: '#bf5e0f',
          icon: {
            className: 'fas fa-exclamation-circle fa-lg',
            tagName: 'i',
            text: '',
            color: 'white'
          }
        }
      ],
      duration: 8000,
      ripple: true,
      position: { x: 'right', y: 'bottom' },
      dismissible: true
    });
  }

  requestLatest() {
    this.sendWebSocket('latest', {
      page: this.state.page,
      searchKeyword: this.state.searchKeyword,
      sortBy: this.state.selectedSortOption.sortBy,
      sortByDesc: this.state.selectedSortOption.sortByDesc,
      hideInactive: this.state.selectedSortOption.hideInactive
    });
  }

  toast({ type, title }) {
    // this.notyf.dismissAll();
    if (type !== 'warning' && type !== 'error') {
      if (title.toLowerCase().includes('buy ')) {
        type = 'buy';
      }
      if (title.toLowerCase().includes('sell ')) {
        type = 'sell';
      }
    }
    this.notyf.open({
      type,
      message: title
    });
  }

  handleCommandResponse(response) {
    if (!response) {
      return;
    }

    if (response.type === 'latest') {
      this.setState({
        isLoaded: true,
        isAuthenticated: response.isAuthenticated,
        botOptions: response.botOptions,
        configuration: response.configuration,
        orderStats: response.common.orderStats,
        closedTradesSetting: _.get(response, ['common', 'closedTradesSetting'], {}),
        closedTrades: _.get(response, ['common', 'closedTrades'], []),
        symbols: _.get(response, ['stats', 'symbols'], []),
        packageVersion: _.get(response, ['common', 'version'], ''),
        gitHash: _.get(response, ['common', 'gitHash'], ''),
        accountInfo: _.get(response, ['common', 'accountInfo'], {}),
        publicURL: _.get(response, ['common', 'publicURL'], ''),
        apiInfo: _.get(response, ['common', 'apiInfo'], {}),
        totalProfitAndLoss: _.get(response, ['common', 'totalProfitAndLoss'], ''),
        streamsCount: _.get(response, ['common', 'streamsCount'], 0),
        monitoringSymbolsCount: _.get(
          response,
          ['common', 'monitoringSymbolsCount'],
          0
        ),
        cachedMonitoringSymbolsCount: _.get(
          response,
          ['common', 'cachedMonitoringSymbolsCount'],
          0
        ),
        totalPages: _.get(response, ['common', 'totalPages'], 1),
        tradingViews: _.get(response, ['stats', 'tradingViews'], [])
      });
    }

    if (response.type === 'notification') {
      this.toast({
        type: response.message.type,
        title: response.message.title
      });
    }

    if (response.type === 'dust-transfer-get-result') {
      this.setState({
        dustTransfer: response.dustTransfer
      });
    }

    if (response.type === 'exchange-symbols-get-result') {
      this.setState({
        exchangeSymbols: response.exchangeSymbols
      });
    }
  }

  connectEventStream() {
    const instance = new EventSource(config.eventStreamUrl);

    this.setState(prevState => ({
      eventStream: {
        ...prevState.eventStream,
        instance
      }
    }));

    const self = this;

    instance.onopen = () => {
      console.log('SSE connection is successfully established.');
      this.toast({
        type: 'success',
        title: 'Connected to the bot.'
      });
      self.setState(prevState => ({
        eventStream: {
          ...prevState.eventStream,
          connected: true
        },
        eventStreamDisconnectedNotified: false
      }));
    };

    instance.onmessage = evt => {
      let response = {};
      try {
        response = JSON.parse(evt.data);
      } catch (_e) {}
      self.handleCommandResponse(response);
    };

    instance.onerror = () => {
      console.log(
        'Event stream is disconnected. Reconnect will be attempted automatically.'
      );

      self.setState(prevState => {
        if (prevState.eventStreamDisconnectedNotified === false) {
          this.toast({
            type: 'info',
            title: 'Disconnected from the bot. Reconnecting...'
          });
        }

        return {
          eventStream: {
            ...prevState.eventStream,
            connected: false
          },
          eventStreamDisconnectedNotified: true
        };
      });
    };
  }

  isAccountLoaded() {
    const { isLoaded, accountInfo } = this.state;

    return isLoaded === true && _.get(accountInfo, 'accountType') === 'SPOT';
  }

  isLocked() {
    const { isAuthenticated, botOptions, isLoaded } = this.state;

    return (
      isLoaded === true &&
      isAuthenticated === false &&
      _.get(botOptions, ['authentication', 'lockList'], true) === true
    );
  }

  async sendWebSocket(command, data = {}) {
    const authToken = localStorage.getItem('authToken') || '';

    return axios
      .post(config.apiCommandUrl, { command, authToken, data })
      .then(response => {
        this.handleCommandResponse(response.data);
        return response.data;
      })
      .catch(error => {
        console.log(error);
        return null;
      });
  }

  setSortOption(newSortOption) {
    this.setState({
      selectedSortOption: newSortOption
    });
  }

  setSearchKeyword(searchKeyword) {
    if (searchKeyword)
      this.toast({
        type: 'success',
        title: `Filtering assets with ${searchKeyword}`
      });
    else
      this.toast({
        type: 'success',
        title: this.state.selectedSortOption.hideInactive
          ? 'Showing active symbols'
          : 'Showing all symbols'
      });

    this.setState({
      searchKeyword,
      page: 1
    });
  }

  setPage(newPage) {
    this.setState({
      page: newPage
    });
  }

  componentDidMount() {
    let selectedSortOption = {
      sortBy: 'default',
      sortByDesc: false,
      hideInactive: false
    };

    try {
      selectedSortOption = JSON.parse(
        localStorage.getItem('selectedSortOption')
      ) || {
        sortBy: 'default',
        sortByDesc: false,
        hideInactive: false
      };
    } catch (e) {}

    this.setState({
      selectedSortOption
    });

    this.connectEventStream();
    this.requestLatest();

    this.timerID = setInterval(() => this.requestLatest(), 1000);
  }

  componentWillUnmount() {
    clearInterval(this.timerID);

    const {
      eventStream: { instance }
    } = this.state;

    if (instance) {
      instance.close();
    }
  }

  render() {
    const {
      eventStream: { connected },
      packageVersion,
      gitHash,
      exchangeSymbols,
      symbols,
      configuration,
      orderStats,
      accountInfo,
      closedTradesSetting,
      closedTrades,
      publicURL,
      apiInfo,
      streamsCount,
      monitoringSymbolsCount,
      cachedMonitoringSymbolsCount,
      dustTransfer,
      availableSortOptions,
      selectedSortOption,
      searchKeyword,
      isAuthenticated,
      isLoaded,
      totalProfitAndLoss,
      page,
      totalPages,
      tradingViewIntervals,
      tradingViews
    } = this.state;

    if (isLoaded === false) {
      return <AppLoading />;
    }

    if (this.isLocked()) {
      return <LockScreen />;
    }

    if (this.isAccountLoaded() === false) {
      return <APIError />;
    }

    const activeSymbols = selectedSortOption.hideInactive
      ? symbols.filter(
          s =>
            s.symbolConfiguration.buy.enabled ||
            s.symbolConfiguration.sell.enabled
        )
      : symbols;

    const coinWrappers = activeSymbols.map((symbol, index) => {
      const symbolTradingViewIntervals = (
        symbol.symbolConfiguration.botOptions.tradingViews || []
      ).map(c => c.interval);

      const symbolTradingViews = tradingViews
        .filter(
          tradingView =>
            tradingView.request.symbol === symbol.symbol &&
            symbolTradingViewIntervals.includes(tradingView.request.interval)
        )
        .sort((a, b) => {
          const aIdx = tradingViewIntervals.indexOf(a.request.interval);
          const bIdx = tradingViewIntervals.indexOf(b.request.interval);
          return aIdx - bIdx;
        });

      return (
        <CoinWrapper
          extraClassName={
            index % 2 === 0 ? 'coin-wrapper-even' : 'coin-wrapper-odd'
          }
          key={'coin-wrapper-' + symbol.symbol}
          connected={connected}
          isAuthenticated={isAuthenticated}
          symbolInfo={symbol}
          symbolTradingViews={symbolTradingViews}
          configuration={configuration}
          sendWebSocket={this.sendWebSocket}
          tradingViewIntervals={tradingViewIntervals}
        />
      );
    });

    const paginationItems = [];

    paginationItems.push(
      <Pagination.First
        key='first'
        disabled={page === 1 || totalPages === 1}
        onClick={() => this.setPage(1)}
      />
    );
    paginationItems.push(
      <Pagination.Prev
        key='pagination-item-prev'
        onClick={() => this.setPage(page - 1)}
        disabled={page === 1 || totalPages === 1}
      />
    );
    const maxButtons = 8;
    const buttons = Math.min(maxButtons, ~~totalPages);
    [...Array(buttons).keys()].forEach(x => {
      const pageNum = Math.min(
        Math.max(x + 1, page + x + 1 - Math.ceil(buttons / 2)),
        totalPages + x + 1 - buttons
      );
      paginationItems.push(
        <Pagination.Item
          active={pageNum === page}
          disabled={pageNum > totalPages}
          key={`pagination-item-${x}`}
          onClick={() => this.setPage(pageNum)}>
          {pageNum}
        </Pagination.Item>
      );
    });
    paginationItems.push(
      <Pagination.Next
        key='pagination-item-next'
        onClick={() => this.setPage(page + 1)}
        disabled={page === totalPages || page >= totalPages}
      />
    );
    const lastPage = totalPages;
    paginationItems.push(
      <Pagination.Last
        key='last'
        disabled={page === totalPages || page >= totalPages}
        onClick={() => this.setPage(lastPage)}
      />
    );

    return (
      <React.Fragment>
        <Header
          isAuthenticated={isAuthenticated}
          configuration={configuration}
          publicURL={publicURL}
          exchangeSymbols={exchangeSymbols}
          sendWebSocket={this.sendWebSocket}
          availableSortOptions={availableSortOptions}
          selectedSortOption={selectedSortOption}
          searchKeyword={searchKeyword}
          setSortOption={this.setSortOption}
          setSearchKeyword={this.setSearchKeyword}
          tradingViewIntervals={tradingViewIntervals}
        />
        {_.isEmpty(configuration) === false ? (
          <div className='app-body'>
            <div className='app-body-header-wrapper'>
              <AccountWrapper
                isAuthenticated={isAuthenticated}
                accountInfo={accountInfo}
                dustTransfer={dustTransfer}
                sendWebSocket={this.sendWebSocket}
                totalProfitAndLoss={totalProfitAndLoss}
                setSearchKeyword={this.setSearchKeyword}
              />
              <ProfitLossWrapper
                isAuthenticated={isAuthenticated}
                symbols={symbols}
                closedTradesSetting={closedTradesSetting}
                closedTrades={closedTrades}
                sendWebSocket={this.sendWebSocket}
                totalProfitAndLoss={totalProfitAndLoss}
              />
              <OrderStats
                orderStats={orderStats}
                selectedSortOption={selectedSortOption}
                searchKeyword={searchKeyword}
                setSearchKeyword={this.setSearchKeyword}
              />
            </div>
            <Pagination>{paginationItems}</Pagination>
            <div className='coin-wrappers'>{coinWrappers}</div>
            <Pagination>{paginationItems}</Pagination>
            <div className='app-body-footer-wrapper'>
              <Status
                apiInfo={apiInfo}
                streamsCount={streamsCount}
                monitoringSymbolsCount={monitoringSymbolsCount}
                cachedMonitoringSymbolsCount={cachedMonitoringSymbolsCount}
              />
            </div>
          </div>
        ) : (
          <div className='app-body app-body-loading'>
            <Spinner animation='border' role='status'>
              <span className='sr-only'>Loading...</span>
            </Spinner>
          </div>
        )}

        <Footer packageVersion={packageVersion} gitHash={gitHash} />
      </React.Fragment>
    );
  }
}

ReactDOM.render(<App />, document.querySelector('#app'));
