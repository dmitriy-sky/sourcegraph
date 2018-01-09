import * as CopyWebpackPlugin from 'copy-webpack-plugin'
import * as ExtractTextPlugin from 'extract-text-webpack-plugin'
import * as path from 'path'
import * as Tapable from 'tapable'
import * as webpack from 'webpack'
const sassImportOnce = require('node-sass-import-once')
// const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')

const plugins: webpack.Plugin[] = [
    // Uncomment to analyze bundle size
    // new BundleAnalyzerPlugin(),

    // Print some output for VS Code tasks to know when a build started
    function(this: Tapable): void {
        this.plugin('watch-run', (watching: any, cb: () => void) => {
            console.log('Begin compile at ' + new Date())
            cb()
        })
    },
]

if (process.env.NODE_ENV === 'production') {
    plugins.push(
        new webpack.DefinePlugin({
            'process.env': {
                NODE_ENV: JSON.stringify('production'),
            },
        }),
        new webpack.optimize.UglifyJsPlugin({
            sourceMap: false,
        })
    )
} else {
    plugins.push(
        new webpack.DefinePlugin({
            'process.env': {
                NODE_ENV: JSON.stringify('development'),
            },
        })
    )
}

plugins.push(
    new ExtractTextPlugin({
        filename: 'styles/[name].bundle.css',
        allChunks: true,
    })
)

plugins.push(
    new CopyWebpackPlugin([
        {
            from: 'node_modules/monaco-editor/min/vs',
            to: 'scripts/vs',
        },
    ])
)

plugins.push(new webpack.ContextReplacementPlugin(/\/node_modules\/@sqs\/jsonc-parser\/lib\/edit\.js$/, /.*/))

const devtool = process.env.NODE_ENV === 'production' ? undefined : 'cheap-module-eval-source-map'

const config: webpack.Configuration = {
    entry: {
        app: path.join(__dirname, 'src/app.tsx'),
        style: path.join(__dirname, 'src/app.scss'),
    },
    output: {
        path: path.join(__dirname, '../ui/assets'),
        filename: 'scripts/[name].bundle.js',
        chunkFilename: 'scripts/[id].chunk.js',
    },
    devtool,
    devServer: {
        contentBase: '../ui/assets',
        noInfo: true,
        port: 3088,
        headers: { 'Access-Control-Allow-Origin': '*' },
    },
    plugins,
    resolve: {
        extensions: ['.ts', '.tsx', '.js'],
    },
    stats: 'minimal',
    module: {
        loaders: [
            {
                test: /\.tsx?$/,
                loaders: [
                    'babel-loader',
                    {
                        loader: 'ts-loader',
                        options: {
                            compilerOptions: {
                                module: 'esnext',
                                noEmit: false,
                            },
                            transpileOnly: process.env.DISABLE_TYPECHECKING === 'true',
                        },
                    },
                ],
            },
            {
                test: /\.jsx?$/,
                loader: 'babel-loader',
            },
            {
                // sass / scss loader for webpack
                test: /\.(css|sass|scss)$/,
                loader: ExtractTextPlugin.extract([
                    {
                        loader: 'css-loader',
                        options: {
                            minimize: process.env.NODE_ENV === 'production',
                        },
                    },
                    'postcss-loader',
                    {
                        loader: 'sass-loader',
                        options: {
                            includePaths: [__dirname + '/node_modules'],
                            importer: sassImportOnce,
                            importOnce: {
                                css: true,
                            },
                        },
                    },
                ]),
            },
        ],
    } as webpack.OldModule,
}

export default config
