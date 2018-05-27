import consts from 'consts/const_global';
import Serialization from "common/utils/Serialization";
import BufferExtended from 'common/utils/BufferExtended';
import InterfaceSatoshminDB from 'common/satoshmindb/Interface-SatoshminDB';
import PoolDataMiner from "common/mining-pools/pool-management/Pool-Data-Miner"
const uuid = require('uuid');

class PoolData {

    constructor(databaseName) {

        this._db = new InterfaceSatoshminDB(databaseName ? databaseName : consts.DATABASE_NAMES.POOL_DATABASE);
        
        this._statsBufferSize = consts.MINING_POOL.WINDOW_SIZE;
        this._currentBlockPos = 0;
        
        this._minersList = [];
        this._blocksMiningInfo = [];
    }
    
    /**
     * @param minerAddress
     * @returns miner or null if it doesn't exist
     */
    getMiner(minerAddress){
        
        for (let i = 0; i < this._minersList.length; ++i) 
            if (this._minersList[i].address === minerAddress)
                return this._minersList[i];
                
        return null;
    }
    
    /**
     * Insert a new miner if not exists. Synchronizes with DB.
     * @param minerAddress
     * @param minerReward
     * @returns true/false
     */
    async addMiner(minerAddress, minerReward = 0){
        
        if (this.getMiner(minerAddress) === null) {

            if ( !Buffer.isBuffer(minerAddress) || minerAddress.length !== consts.ADDRESSES.PUBLIC_KEY )
                throw {message: "miner address is invalid" };


            this._minersList.push( new PoolDataMiner( uuid.v4(), minerAddress, minerReward, [] ) );

            return (await this.saveMinersList());

        }
        
        return false; //miner already exists
    }
    
    /**
     * Remove a miner if exists. Synchronizes with DB.
     * @param minerAddress
     * @returns true/false 
     */
    async removeMiner(minerAddress){

        let response = this.getMiner(minerAddress);

        if (response === null)
            return false; //miner doesn't exists
        
        let index = response.index;
        
        this._minersList[index] = this._minersList[this._minersList.length - 1];
        this._minersList.pop();
        
        return (await this.saveMinersList());
    }
    
    /**
     * Set the list of active miners
     */
    setMinersList(minersList) {
        this._minersList = minersList;
    }
    
    /**
     * @returns the list with active miners
     */
    getMinersList() {
        return this._minersList;
    }
    
    /**
     * Set the list with statistics for the last X mined blocks
     */
    setBlocksMiningInfo(blocksMiningInfo) {
        this._blocksMiningInfo = blocksMiningInfo;
    }
    
    /**
     * @returns the list with statistics for the last X mined blocks
     */
    getBlocksMiningInfo() {
        return this._blocksMiningInfo;
    }
    
    /**
     * Add a new mined block statistics to _blocksMiningInfo circular buffer
     * @param newStatistic
     */
    addMinedBlockStatistics(newStatistic) {
        
        this._blocksMiningInfo[this._currentBlockPos++] = newStatistic;
        if (this._currentBlockPos === this._statsBufferSize)
            this._currentBlockPos = 0;
    }

    /**
     * Set miners reward to 0. Synchronizes with DB.
     * @returns {Promise<*>}
     */
    async resetRewards() {

        for (let i = 0; i < this._minersList.length; ++i)
            this._minersList[i].reward = 0;

        return (await this.saveMinersList());
    }
    
    /**
     * Set new reward for miner if it exists
     * @param minerAddress
     * @returns miner reward or 0 if it doesn't exist
     */
    getMinerReward(minerAddress) {

        let response = this.getMiner(minerAddress);
        if (response === null) return 0;
        
        return response.miner.reward;
    }

    /**
     * Set new reward for miner if it exists
     * @param minerAddress
     * @param reward
     * @returns {boolean} true/false if miner exists or not
     */
    setMinerReward(minerAddress, reward){
        
        let response = this.getMiner(minerAddress);
        if (response === null)
            return false;
        
        response.reward = reward;
        
        return true;
    }
    
    /**
     * @param minerAddress
     * @param reward
     */
    increaseMinerReward(minerAddress, reward) {

        for (let i = 0; i < this._minersList.length; ++i) {
            if (this._minersList[i].address === minerAddress){
                this._minersList[i].reward += reward;
                break;
            }
        }
    }

    /**
     * @param id
     * @param reward
     */
    increaseMinerRewardById(id, reward) {

        this._minersList[id].reward += reward;

    }
    
    _serializeMiners() {
        
        let list = [Serialization.serializeNumber4Bytes(this._minersList.length)];

        for (let i = 0; i < this._minersList.length; ++i)
            list.push(this._minersList[i].serializeMiner());

        return Buffer.concat(list);
    }
    
    _deserializeMiners(buffer, offset = 0) {

        try {
            
            let numMiners = Serialization.deserializeNumber( BufferExtended.substr( buffer, offset, 4 ) );
            offset += 4;

            this._minersList = [];
            for (let i = 0; i < numMiners; ++i) {

                let miner = new PoolDataMiner(0,undefined, []);
                offset = miner.deserializeMiner(buffer, offset );

            }
            
            return true;

        } catch (exception){
            console.log("Error deserialize minersList. ", exception);
            throw exception;
        }
    }
    
    /**
     * Load _minersList from database
     * @returns {boolean} true is success, otherwise false
     */
    async loadMinersList() {
        
        try{

            let buffer = await this._db.get("minersList");
            let response = this._deserializeMiners(buffer);
            
            if (response !== true){
                console.log('Unable to load _minersList from DB');
                return false;
            }
            
            return true;
        }
        catch (exception){

            console.log('ERROR loading _minersList from BD: ',  exception);
            return false;
        }
    }

    /**
     * Save _minersList to database
     * @returns {boolean} true is success, otherwise false
     */
    async saveMinersList() {

        try{

            let buffer = this._serializeMiners();
            
            let response = await this._db.save("minersList", buffer);
            if (response !== true) {
                console.log('Unable to save _minersList to DB');
                return false;
            }
            
            return true;
        }
        catch (exception){

            console.log('ERROR saving _minersList in DB: ',  exception);
            return false;
        }
    }

    /**
     * @param minersList
     * @returns {boolean} true if this._minersList === minersList
     */
    compareMinersList(minersList) {

        if (minersList.length !== this._minersList.length)
            return true;

        for (let i = 0; i < this._minersList; ++i){
            if (this._minersList[i].address !== minersList[i].address)
                return true;
        }

        return false;
    }

    /**
     * @param miner1
     * @param miner2
     * @returns {boolean} true if miners are equal
     */
    static compareMiners(miner1, miner2) {

        return miner1 === miner2 || miner1.address === miner2.address;

    }

}

export default PoolData;